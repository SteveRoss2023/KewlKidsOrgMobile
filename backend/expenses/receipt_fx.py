"""
Convert receipt amounts to CAD using Frankfurter (ECB rates, no API key).
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from typing import Any, Dict, Optional, Tuple

import requests

logger = logging.getLogger(__name__)

FRANKFURTER_BASE = 'https://api.frankfurter.app'
TARGET = 'CAD'
_rate_cache: Dict[Tuple[str, str, str], Tuple[float, str]] = {}


def _quantize(val: float) -> float:
    return float(Decimal(str(val)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


def _parse_as_of(raw: Optional[str]) -> str:
    """Return YYYY-MM-DD for FX lookup; fall back to today."""
    if isinstance(raw, str) and re_match_ymd(raw.strip()[:10]):
        return raw.strip()[:10]
    return date.today().isoformat()


def re_match_ymd(s: str) -> bool:
    try:
        datetime.strptime(s, '%Y-%m-%d')
        return True
    except ValueError:
        return False


def fetch_cad_rate(currency: str, as_of: str) -> Optional[Tuple[float, str]]:
    """
    Return (rate, fx_as_of) where CAD = amount * rate.
    CAD→CAD is 1.0. None if the FX API fails.
    """
    code = (currency or '').strip().upper()
    if not code or len(code) != 3:
        return None
    if code == TARGET:
        return 1.0, as_of

    cache_key = (as_of, code, TARGET)
    if cache_key in _rate_cache:
        return _rate_cache[cache_key]

    def _get(path: str) -> Optional[Tuple[float, str]]:
        url = f'{FRANKFURTER_BASE}/{path}'
        resp = requests.get(
            url,
            params={'from': code, 'to': TARGET},
            timeout=12,
        )
        if resp.status_code >= 400:
            logger.warning('Frankfurter %s failed: %s %s', path, resp.status_code, resp.text[:200])
            return None
        data = resp.json()
        rates = data.get('rates') or {}
        rate = rates.get(TARGET)
        if rate is None:
            return None
        fx_as_of = str(data.get('date') or as_of)
        result = (float(rate), fx_as_of)
        _rate_cache[cache_key] = result
        return result

    try:
        got = _get(as_of)
        if got is not None:
            return got
        # Weekend/holiday or future date → latest
        return _get('latest')
    except Exception as e:
        logger.warning('Frankfurter FX lookup failed for %s: %s', code, e)
        return None


def apply_cad_conversion(result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Mutate parse result: convert total / line money fields to CAD when currency != CAD.
    On failure, leave original amounts and set fx_error.
    """
    currency = result.get('currency')
    if not isinstance(currency, str) or not currency:
        return result

    currency = currency.strip().upper()
    result['currency'] = currency

    if currency == TARGET:
        result['converted_to'] = TARGET
        return result

    as_of = _parse_as_of(result.get('expense_date'))
    rate_info = fetch_cad_rate(currency, as_of)
    if rate_info is None:
        result['fx_error'] = f'Could not convert {currency} to CAD'
        return result

    rate, fx_as_of = rate_info
    original_total = result.get('total')

    def convert(val: Any) -> Optional[float]:
        if val is None:
            return None
        try:
            return _quantize(float(val) * rate)
        except (TypeError, ValueError, InvalidOperation):
            return None

    if original_total is not None:
        result['original_total'] = float(original_total)
        converted = convert(original_total)
        if converted is not None:
            result['total'] = converted

    items = result.get('line_items')
    if isinstance(items, list):
        for item in items:
            if not isinstance(item, dict):
                continue
            if item.get('unit_price') is not None:
                item['original_unit_price'] = float(item['unit_price'])
                converted_unit = convert(item.get('unit_price'))
                if converted_unit is not None:
                    item['unit_price'] = converted_unit
            if item.get('line_total') is not None:
                item['original_line_total'] = float(item['line_total'])
                converted_line = convert(item.get('line_total'))
                if converted_line is not None:
                    item['line_total'] = converted_line

    result['fx_rate'] = rate
    result['fx_as_of'] = fx_as_of
    result['converted_to'] = TARGET
    return result
