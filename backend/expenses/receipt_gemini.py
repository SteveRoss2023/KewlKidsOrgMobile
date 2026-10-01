"""
Receipt parsing via Google Gemini vision (structured JSON).
Falls back to the caller if unavailable / errors.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Any, Dict, List, Optional

import requests
from PIL import Image

logger = logging.getLogger(__name__)

PROMPT = """You are reading a retail/grocery receipt photo.
Extract the purchase details and return ONLY valid JSON (no markdown) with this shape:
{
  "merchant": "store name string or null",
  "expense_date": "YYYY-MM-DD or null",
  "total": number or null,
  "subtotal": number or null,
  "tax": number or null,
  "line_items": [
    {
      "name": "product name",
      "quantity": number or null,
      "unit_price": number or null,
      "line_total": number
    }
  ]
}

Rules:
- Include every product/fee line (plastic bag, recycle fee, etc.).
- Exclude payment method lines, change, rewards marketing, survey text.
- Prefer BALANCE DUE / amount due for total (not "you could have saved").
- quantity defaults to 1 when not shown.
- unit_price is the per-unit price when qty is shown (e.g. 4 @ 2.29); otherwise same as line_total.
- Numbers must be plain JSON numbers (no $ or commas).
"""


def _gemini_configured() -> bool:
    return bool(os.getenv('GEMINI_API_KEY', '').strip())


def _model_name() -> str:
    return (os.getenv('GEMINI_MODEL') or 'gemini-flash-lite-latest').strip()


def _image_to_jpeg_b64(image: Image.Image, max_side: int = 1600) -> str:
    img = image.convert('RGB')
    w, h = img.size
    if max(w, h) > max_side:
        scale = max_side / float(max(w, h))
        img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
    buf = BytesIO()
    img.save(buf, format='JPEG', quality=85)
    return base64.b64encode(buf.getvalue()).decode('ascii')


def _money(val: Any) -> Optional[float]:
    if val is None or val == '':
        return None
    try:
        if isinstance(val, (int, float, Decimal)):
            d = Decimal(str(val)).quantize(Decimal('0.01'))
        else:
            s = str(val).strip().replace('$', '').replace(',', '')
            d = Decimal(s).quantize(Decimal('0.01'))
        if d < 0 or d > Decimal('1000000'):
            return None
        return float(d)
    except (InvalidOperation, ValueError, TypeError):
        return None


def _normalize_gemini_payload(data: Dict[str, Any]) -> Dict[str, Any]:
    merchant = data.get('merchant')
    if isinstance(merchant, str):
        merchant = merchant.strip()[:200] or None
    else:
        merchant = None

    expense_date = data.get('expense_date')
    if isinstance(expense_date, str):
        expense_date = expense_date.strip()[:10] or None
        if expense_date and not re.match(r'^\d{4}-\d{2}-\d{2}$', expense_date):
            expense_date = None
    else:
        expense_date = None

    total = _money(data.get('total'))
    line_items: List[Dict[str, Any]] = []
    raw_items = data.get('line_items') or []
    if isinstance(raw_items, list):
        for idx, raw in enumerate(raw_items):
            if not isinstance(raw, dict):
                continue
            name = (raw.get('name') or '').strip()
            if len(name) < 2:
                continue
            qty = raw.get('quantity')
            try:
                quantity = float(qty) if qty not in (None, '') else 1.0
            except (TypeError, ValueError):
                quantity = 1.0
            unit_price = _money(raw.get('unit_price'))
            line_total = _money(raw.get('line_total'))
            if line_total is None and unit_price is not None:
                line_total = round(unit_price * quantity, 2)
            if line_total is None:
                continue
            if unit_price is None:
                unit_price = line_total if quantity == 1 else round(line_total / quantity, 2)
            line_items.append(
                {
                    'name': name[:200],
                    'quantity': quantity,
                    'unit_price': unit_price,
                    'line_total': line_total,
                    'order': idx,
                }
            )

    found = {
        'merchant': bool(merchant),
        'expense_date': bool(expense_date),
        'total': total is not None,
        'total_labeled': total is not None,
        'line_items': len(line_items) > 0,
        'line_item_count': len(line_items),
    }
    confidence = 'high' if (found['total'] and found['merchant'] and found['line_items']) else (
        'medium' if found['total'] or found['merchant'] or found['line_items'] else 'low'
    )

    return {
        'merchant': merchant,
        'expense_date': expense_date,
        'total': total,
        'line_items': line_items,
        'raw_text': json.dumps(data, ensure_ascii=False)[:8000],
        'found': found,
        'confidence': confidence,
        'ocr_available': True,
        'engine': 'gemini',
    }


def _extract_json_text(text: str) -> Dict[str, Any]:
    text = (text or '').strip()
    if text.startswith('```'):
        text = re.sub(r'^```(?:json)?\s*', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\s*```$', '', text)
    return json.loads(text)


def _model_candidates() -> list[str]:
    primary = _model_name()
    # Prefer configured model, then other free Flash variants if quota/demand hits.
    extras = [
        'gemini-flash-latest',
        'gemini-flash-lite-latest',
        'gemini-2.5-flash-lite',
        'gemini-3.1-flash-lite-preview',
        'gemini-3.5-flash-lite',
    ]
    out: list[str] = []
    for m in [primary, *extras]:
        if m and m not in out:
            out.append(m)
    return out


def _retry_seconds_from_429(body: str) -> float:
    m = re.search(r'retry in\s+([0-9.]+)\s*s', body or '', re.IGNORECASE)
    if m:
        try:
            return min(60.0, max(1.0, float(m.group(1)) + 0.5))
        except ValueError:
            pass
    return 8.0


def parse_receipt_image_gemini(image: Image.Image) -> Dict[str, Any]:
    """
    Call Gemini vision. Raises RuntimeError if not configured or API fails.
    Tries alternate free Flash models on 429/503.
    """
    import time

    api_key = os.getenv('GEMINI_API_KEY', '').strip()
    if not api_key:
        raise RuntimeError('GEMINI_API_KEY is not set')

    b64 = _image_to_jpeg_b64(image)
    body = {
        'contents': [
            {
                'parts': [
                    {'text': PROMPT},
                    {
                        'inline_data': {
                            'mime_type': 'image/jpeg',
                            'data': b64,
                        }
                    },
                ]
            }
        ],
        'generationConfig': {
            'temperature': 0.1,
            'responseMimeType': 'application/json',
        },
    }

    last_err: Optional[Exception] = None
    for model in _model_candidates():
        url = (
            f'https://generativelanguage.googleapis.com/v1beta/models/'
            f'{model}:generateContent'
        )
        for attempt in range(3):
            resp = requests.post(url, params={'key': api_key}, json=body, timeout=90)
            if resp.status_code in (429, 503):
                last_err = RuntimeError(
                    f'Gemini API error {resp.status_code} ({model}): {resp.text[:400]}'
                )
                wait = _retry_seconds_from_429(resp.text) if resp.status_code == 429 else 1.5 * (attempt + 1)
                logger.warning(
                    'Gemini %s hit %s; waiting %.1fs (attempt %s)',
                    model,
                    resp.status_code,
                    wait,
                    attempt + 1,
                )
                time.sleep(wait)
                continue
            if resp.status_code >= 400:
                last_err = RuntimeError(
                    f'Gemini API error {resp.status_code} ({model}): {resp.text[:500]}'
                )
                # Try next model for 404/not available
                break

            payload = resp.json()
            try:
                text = payload['candidates'][0]['content']['parts'][0]['text']
            except (KeyError, IndexError, TypeError) as e:
                last_err = RuntimeError(f'Unexpected Gemini response shape ({model}): {e}')
                break

            data = _extract_json_text(text)
            if not isinstance(data, dict):
                last_err = RuntimeError(f'Gemini did not return a JSON object ({model})')
                break
            result = _normalize_gemini_payload(data)
            result['engine'] = 'gemini'
            result['gemini_model'] = model
            return result
        # exhausted retries for this model — try next

    raise last_err or RuntimeError('Gemini API unavailable')


def try_parse_receipt_gemini(image: Image.Image) -> Optional[Dict[str, Any]]:
    """Return Gemini parse result, or None to allow Tesseract fallback."""
    if not _gemini_configured():
        return None
    try:
        return parse_receipt_image_gemini(image)
    except Exception as e:
        logger.warning('Gemini receipt parse failed, will fall back: %s', e)
        return None
