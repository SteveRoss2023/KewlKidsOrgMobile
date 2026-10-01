"""
Free receipt OCR via Tesseract: extract merchant, date, total, and line items.
"""
from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image, ImageEnhance, ImageOps


MONEY_RE = re.compile(
    r'(?<![\w.])(?:\$|CAD\s*)?(\d{1,6}(?:[.,]\d{3})*(?:[.,]\d{1,2})|\d*[.,]\d{1,2})\b',
    re.IGNORECASE,
)
TOTAL_LABEL_RE = re.compile(
    r'\b(grand\s*total|amount\s*due|balance\s*due|total\s*due|balance)\b',
    re.IGNORECASE,
)
# Weaker labels used only as fallback (avoid "Sub Total" / "could have saved $X")
WEAK_TOTAL_LABEL_RE = re.compile(
    r'\b(sub\s*total|subtotal|(?<!\w)total(?!\s*due))\b',
    re.IGNORECASE,
)
DATE_PATTERNS = [
    (re.compile(r'\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b'), '%Y-%m-%d'),
    (re.compile(r'\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b'), '%m-%d-%Y'),
    (re.compile(r'\b(\d{1,2})[/-](\d{1,2})[/-](\d{2})\b'), '%m-%d-%y'),
    (
        re.compile(
            r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b',
            re.IGNORECASE,
        ),
        '%b-%d-%Y',
    ),
]

# Qty @ unit patterns: "4 @ 2.29", "2@9.49"
QTY_AT_RE = re.compile(
    r'^(?P<name>.+?)\s+(?P<qty>\d+(?:[.,]\d+)?)\s*@\s*(?P<unit>\d*[.,]\d{1,2})\s+(?P<total>\d*[.,]\d{1,2})\s*[A-Za-z]?\s*$',
    re.IGNORECASE,
)
# Simple: "Item Name 27.99 G" or "Item Name 27.99"
SIMPLE_ITEM_RE = re.compile(
    r'^(?P<name>.+?)\s+(?P<total>\d*[.,]\d{1,2})\s*[A-Za-z&]?\s*$',
)

SKIP_LINE_RE = re.compile(
    r'('
    r'sub\s*total|subtotal|balance\s*due|amount\s*due|grand\s*total|total\s*due|'
    r'\bgst\b|\bhst\b|\bpst\b|\btax\b|taxable|tax[- ]?value|'
    r'\bdebit\b|\bcredit\b|\bcash\b|\bvisa\b|\bmastercard\b|\binterac\b|'
    r'change|approved|auth\s*#|reference|ref\s*#|term\s*#|card\s*#|'
    r'more\s*rewards|could\s*have\s*saved|earned\s+\d+\s*points|'
    r'return|survey|thank\s*you|welcome|canadian\s*owned|'
    r'self\s*checkout|cashier|tel\b|phone|www\.|http|'
    r'flash\s*default|purchase\b|account\s*type|'
    r'^\*?+\s*$'
    r')',
    re.IGNORECASE,
)

# Stop collecting items once we hit summary / payment section
ITEMS_END_RE = re.compile(
    r'^(sub\s*total|subtotal|balance\s*due|amount\s*due|gst|hst|pst|taxable|'
    r'debit|credit|cash|visa|mastercard|interac|change|approved)\b',
    re.IGNORECASE,
)


def _normalize_money(raw: str) -> Optional[Decimal]:
    s = raw.strip().replace(' ', '').replace('$', '')
    if s.startswith(',') or s.startswith('.'):
        s = '0' + s
    if ',' in s and '.' in s:
        if s.rfind(',') > s.rfind('.'):
            s = s.replace('.', '').replace(',', '.')
        else:
            s = s.replace(',', '')
    elif ',' in s:
        parts = s.split(',')
        if len(parts[-1]) == 2:
            s = s.replace(',', '.')
        else:
            s = s.replace(',', '')
    try:
        val = Decimal(s).quantize(Decimal('0.01'))
        if val <= 0 or val > Decimal('1000000'):
            return None
        return val
    except (InvalidOperation, ValueError):
        return None


def _preprocess(image: Image.Image, *, scale: float = 1.0) -> Image.Image:
    img = image.convert('RGB')
    # Cap huge camera images for OCR speed
    max_side = 2200
    w, h = img.size
    if max(w, h) > max_side:
        s = max_side / float(max(w, h))
        img = img.resize((int(w * s), int(h * s)), Image.Resampling.LANCZOS)
    if scale and scale != 1.0:
        img = img.resize(
            (max(1, int(img.size[0] * scale)), max(1, int(img.size[1] * scale))),
            Image.Resampling.LANCZOS,
        )
    gray = ImageOps.grayscale(img)
    gray = ImageOps.autocontrast(gray)
    gray = ImageEnhance.Contrast(gray).enhance(1.6)
    gray = ImageEnhance.Sharpness(gray).enhance(1.5)
    return gray


def _configure_tesseract() -> None:
    """Ensure pytesseract can find the binary on Windows installs."""
    import shutil
    import pytesseract

    if shutil.which('tesseract'):
        return
    for candidate in (
        r'C:\Program Files\Tesseract-OCR\tesseract.exe',
        r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
    ):
        import os
        if os.path.isfile(candidate):
            pytesseract.pytesseract.tesseract_cmd = candidate
            return


def _ocr_text(image: Image.Image) -> str:
    """
    Run several Tesseract passes and keep the text that yields the most
    plausible product lines (grocery receipts vary a lot by photo quality).
    """
    import pytesseract

    _configure_tesseract()
    candidates: list[str] = []
    try:
        for scale in (1.0, 1.5):
            processed = _preprocess(image, scale=scale)
            for psm in (6, 4):
                text = pytesseract.image_to_string(processed, config=f'--psm {psm}') or ''
                if text.strip():
                    candidates.append(text)
    except pytesseract.TesseractNotFoundError as e:
        raise RuntimeError(
            'Tesseract is not installed on the server. '
            'Install the Tesseract OCR binary and ensure it is on PATH.'
        ) from e

    if not candidates:
        return ''

    def score(text: str) -> tuple:
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        items = _parse_line_items(lines)
        total, labeled = _parse_total(text, lines)
        item_sum = sum(
            Decimal(str(i['line_total'])) for i in items if i.get('line_total') is not None
        )
        closeness = 0.0
        if total is not None and items:
            closeness = -float(abs(item_sum - total))
        has_balance = 1 if any(TOTAL_LABEL_RE.search(ln) for ln in lines) else 0
        return (has_balance, len(items), 1 if labeled else 0, closeness, len(text))

    return max(candidates, key=score)


def _parse_merchant(lines: list[str]) -> Optional[str]:
    skip = re.compile(
        r'^(tel|phone|www\.|http|receipt|invoice|thank|welcome|store\s*#|tax|gst|hst|pst)\b',
        re.IGNORECASE,
    )
    for line in lines[:12]:
        cleaned = re.sub(r'\s+', ' ', line).strip(' -|')
        if len(cleaned) < 3 or len(cleaned) > 60:
            continue
        if skip.search(cleaned):
            continue
        if re.fullmatch(r'[\d\s\-().+/]+', cleaned):
            continue
        if MONEY_RE.search(cleaned) and TOTAL_LABEL_RE.search(cleaned):
            continue
        # Prefer lines with letters
        if re.search(r'[A-Za-z]{3,}', cleaned):
            return cleaned[:200]
    return None


def _parse_date(text: str) -> Optional[str]:
    for pattern, fmt in DATE_PATTERNS:
        m = pattern.search(text)
        if not m:
            continue
        try:
            if fmt == '%Y-%m-%d':
                y, mo, d = m.group(1), m.group(2), m.group(3)
                dt = datetime(int(y), int(mo), int(d))
            elif fmt == '%m-%d-%Y':
                mo, d, y = m.group(1), m.group(2), m.group(3)
                dt = datetime(int(y), int(mo), int(d))
            elif fmt == '%m-%d-%y':
                mo, d, y = m.group(1), m.group(2), m.group(3)
                dt = datetime.strptime(f'{mo}-{d}-{y}', '%m-%d-%y')
            else:
                mon, d, y = m.group(1), m.group(2), m.group(3)
                dt = datetime.strptime(f'{mon[:3]}-{d}-{y}', '%b-%d-%Y')
            return dt.date().isoformat()
        except ValueError:
            continue
    return None


def _parse_total(text: str, lines: list[str]) -> Tuple[Optional[Decimal], bool]:
    """Return (total, found_via_label). Prefer BALANCE DUE / amount due over subtotal."""
    strong: list[Decimal] = []
    weak: list[Decimal] = []
    for line in lines:
        # Ignore rewards / savings marketing lines
        if re.search(r'saved|earned|points|rewards', line, re.IGNORECASE):
            continue
        amounts = []
        for m in MONEY_RE.finditer(line):
            val = _normalize_money(m.group(1))
            if val is not None:
                amounts.append(val)
        if not amounts:
            continue
        if TOTAL_LABEL_RE.search(line):
            strong.extend(amounts)
        elif WEAK_TOTAL_LABEL_RE.search(line):
            weak.extend(amounts)
    if strong:
        return max(strong), True
    if weak:
        return max(weak), True

    # Fallback: largest money-looking value in the bottom third of the receipt
    bottom_lines = lines[max(0, len(lines) * 2 // 3) :]
    candidates = []
    for line in bottom_lines:
        if re.search(r'saved|earned|points|rewards|change', line, re.IGNORECASE):
            continue
        for m in MONEY_RE.finditer(line):
            val = _normalize_money(m.group(1))
            if val is not None and val >= Decimal('1.00'):
                candidates.append(val)
    # Also consider unlabeled large amounts near payment section
    for line in lines:
        if re.search(r'^\$?\s*\d+[.,]\d{1,2}\s*$', line.strip()) or re.search(
            r'^(debit|credit|interac|flash).{0,20}\$?\s*\d+[.,]\d{1,2}', line, re.IGNORECASE
        ):
            for m in MONEY_RE.finditer(line):
                val = _normalize_money(m.group(1))
                if val is not None and val >= Decimal('1.00'):
                    candidates.append(val)
    if candidates:
        return max(candidates), False
    return None, False


def _clean_item_name(name: str) -> str:
    name = re.sub(r'\s+', ' ', name).strip(' -*|:.')
    # Drop leading asterisks / SKU noise
    name = re.sub(r'^[\d*]+\s+', '', name)
    name = re.sub(r'[\s$?"\'`]+$', '', name)
    name = re.sub(r'^[\$?"\'`\s]+', '', name)
    return name[:200]


def _parse_line_items(lines: list[str]) -> List[Dict[str, Any]]:
    """
    Heuristic product rows from OCR text.
    Handles:
      Item Name 27.99 G
      Item Name 4 @ 2.29 9.16
    Stops at subtotal / tax / payment section.
    """
    items: List[Dict[str, Any]] = []
    started = False

    for raw in lines:
        line = re.sub(r'\s+', ' ', raw).strip()
        if not line:
            continue

        if ITEMS_END_RE.search(line):
            if started:
                break
            continue

        if SKIP_LINE_RE.search(line):
            continue

        # Need at least one money amount on the line
        if not MONEY_RE.search(line):
            continue

        # Skip pure date / time lines with money-like digits
        if re.search(r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}', line) and not re.search(r'[A-Za-z]{3,}', line):
            continue

        qty: Optional[float] = 1.0
        unit_price: Optional[float] = None
        line_total: Optional[float] = None
        name = ''

        m_qty = QTY_AT_RE.match(line)
        if m_qty:
            name = _clean_item_name(m_qty.group('name'))
            q = _normalize_money(m_qty.group('qty'))
            # qty may be integer without cents — normalize_money rejects ints without decimal
            try:
                qty_val = float(m_qty.group('qty').replace(',', '.'))
            except ValueError:
                qty_val = 1.0
            u = _normalize_money(m_qty.group('unit'))
            t = _normalize_money(m_qty.group('total'))
            if name and t is not None and len(name) >= 2:
                qty = qty_val
                unit_price = float(u) if u is not None else None
                line_total = float(t)
            else:
                continue
        else:
            m_simple = SIMPLE_ITEM_RE.match(line)
            if not m_simple:
                continue
            name = _clean_item_name(m_simple.group('name'))
            t = _normalize_money(m_simple.group('total'))
            # Reject if "name" is mostly numbers or too short / looks like a label
            if not name or len(name) < 2 or t is None:
                continue
            if not re.search(r'[A-Za-z]{2,}', name):
                continue
            if TOTAL_LABEL_RE.search(name) or SKIP_LINE_RE.search(name):
                continue
            # Avoid treating "HST 1.93" style as items (already skipped) — also skip tiny tax-like names
            if re.fullmatch(r'[A-Za-z]{1,3}', name):
                continue
            qty = 1.0
            unit_price = float(t)
            line_total = float(t)

        # Drop absurdly large single items relative to typical grocery (still allow big coffee packs)
        if line_total is not None and line_total > 5000:
            continue

        started = True
        items.append(
            {
                'name': name,
                'quantity': qty,
                'unit_price': unit_price,
                'line_total': line_total,
                'order': len(items),
            }
        )

    return items


def parse_receipt_image(image: Image.Image) -> Dict[str, Any]:
    """
    Prefer Gemini vision when GEMINI_API_KEY is set; fall back to Tesseract.
    """
    from .receipt_gemini import try_parse_receipt_gemini

    gemini = try_parse_receipt_gemini(image)
    if gemini is not None:
        return gemini

    raw_text = _ocr_text(image)
    lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]

    merchant = _parse_merchant(lines)
    expense_date = _parse_date(raw_text)
    total, total_labeled = _parse_total(raw_text, lines)
    line_items = _parse_line_items(lines)

    found = {
        'merchant': bool(merchant),
        'expense_date': bool(expense_date),
        'total': bool(total),
        'total_labeled': total_labeled,
        'line_items': len(line_items) > 0,
        'line_item_count': len(line_items),
    }
    if found['total'] and found['merchant'] and total_labeled and found['line_items']:
        confidence = 'high'
    elif found['total'] and found['merchant'] and total_labeled:
        confidence = 'high'
    elif found['total'] or found['merchant'] or found['line_items']:
        confidence = 'medium'
    else:
        confidence = 'low'

    return {
        'merchant': merchant,
        'expense_date': expense_date,
        'total': float(total) if total is not None else None,
        'line_items': line_items,
        'raw_text': raw_text[:8000],
        'found': found,
        'confidence': confidence,
        'ocr_available': True,
        'engine': 'tesseract',
    }


def parse_receipt_file(path_or_bytes) -> Dict[str, Any]:
    """
    path_or_bytes: filesystem path (str) or file-like / bytes.
    """
    try:
        if isinstance(path_or_bytes, (bytes, bytearray)):
            image = Image.open(BytesIO(path_or_bytes))
        elif hasattr(path_or_bytes, 'read'):
            image = Image.open(path_or_bytes)
        else:
            image = Image.open(path_or_bytes)
    except Exception as e:
        raise ValueError(f'Could not open receipt image: {e}') from e

    with image:
        return parse_receipt_image(image)
