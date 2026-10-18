---
name: Receipt English translate
overview: Update the Gemini receipt prompt so merchant and line-item names are returned in English when the receipt is in another language, using the same existing Gemini scan call (no new API or Tesseract changes).
todos:
  - id: gemini-prompt
    content: Update Gemini PROMPT in receipt_gemini.py to translate merchant/line item names to English
    status: completed
isProject: false
---

# Receipt scan: translate fields to English

## Approach

Gemini already reads the receipt image in one request. Add prompt rules so text fields come back in English when the source language isn’t English. No separate Translate API, no mobile UI changes, no Tesseract work.

## Change

File: [`backend/expenses/receipt_gemini.py`](backend/expenses/receipt_gemini.py)

Update `PROMPT` rules to include:

- Receipt may be in any language.
- Return `merchant` and each `line_items[].name` in **English** (translate when needed; keep clear brand names if commonly used as-is).
- Keep dates as `YYYY-MM-DD` and money as plain numbers (no currency-word translation issues).
- Do not invent items; only translate/extract what is on the receipt.

Existing JSON shape and `_normalize_gemini_payload` stay the same.

## Out of scope

- Tesseract fallback (still English-oriented; only used if Gemini fails)
- UI copy changes (wizard already shows Gemini confidence + editable lines)

## Verify

- Scan a non-English receipt with Gemini configured → line items / merchant appear in English in the review step.
- English receipt still behaves as today.
