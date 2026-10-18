---
name: OCR line items
overview: Extend free Tesseract receipt OCR to extract product line items, return them from the parse API, and prefill the scan wizard (and edit form after parse) so items appear when a receipt is added—still editable before save.
todos:
  - id: ocr-line-parser
    content: Add _parse_line_items heuristics + return line_items from parse_receipt_image / parse API
    status: completed
  - id: mobile-prefill
    content: Extend ReceiptParseResult; prefill wizard (and ExpenseForm if empty) from parsed.line_items
    status: completed
  - id: verify-rebuild
    content: Smoke-check against Save-On samples; rebuild mobile dist
    status: completed
isProject: false
---

# Auto-fill line items from receipt OCR

## Approach

Extend the existing free Tesseract pipeline in [`backend/expenses/receipt_ocr.py`](backend/expenses/receipt_ocr.py) to parse item rows (name + price, optional qty/unit price), expose them on `POST /receipts/{id}/parse/`, and map them into the mobile `LineItemsEditor` when the scan wizard finishes OCR.

Heuristic parsing is the right fit here (same stack as merchant/total)—no paid OCR. Accuracy will vary by receipt quality; users keep full edit/add/remove before save.

```mermaid
flowchart LR
  upload[Upload receipt] --> parse[parseReceipt API]
  parse --> ocr[Tesseract + line heuristics]
  ocr --> ui[Prefill LineItemsEditor]
  ui --> save[Save expense with line_items_input]
```

## Backend

In [`backend/expenses/receipt_ocr.py`](backend/expenses/receipt_ocr.py):

- Add `_parse_line_items(lines)` that:
  - Skips header/footer noise (merchant, dates, `SUB TOTAL` / `GST` / `BALANCE` / `DEBIT` / `CHANGE` / `APPROVED` / rewards / returns, etc.).
  - Matches product rows ending in a money amount, e.g. `Gillette Pro Glide2 27.99 G` or `Campbells Soup 4 @ 2.29 9.16`.
  - Captures optional `N @ unit_price` for quantity/unit price; otherwise qty `1` and `line_total` = price.
  - Returns list of `{ name, quantity, unit_price, line_total, order }`.
- Include `line_items` in `parse_receipt_image` result and in `found` / confidence (e.g. bump confidence when items found).
- Update error stubs in [`backend/expenses/views.py`](backend/expenses/views.py) `parse` action to return `line_items: []`.

Tune against the known Save-On-Foods samples under `backend/media/receipts/family_9/` so both short and long receipts produce sensible rows (plastic/recycle fees included as items).

## Mobile

- Extend [`ReceiptParseResult`](mobile/types/expenses.ts) with `line_items?: Array<{ name; quantity?; unit_price?; line_total?; order? }>`.
- In [`ReceiptScanWizard.tsx`](mobile/components/expenses/ReceiptScanWizard.tsx), after successful parse: `setLines(draftLinesFromExpenseItems(parsed.line_items))` (reuse helper from [`LineItemsEditor.tsx`](mobile/components/expenses/LineItemsEditor.tsx)); update the OCR hint so it no longer says line items are manual-only.
- Optionally: after receipt upload in [`ExpenseForm.tsx`](mobile/components/expenses/ExpenseForm.tsx), call `parseReceipt` and merge suggested lines when the editor is empty—so attaching a receipt on edit also prefills.

## Out of scope

- Backfilling line items on expenses already saved without re-scanning (user can re-open scan flow or we can add a “Re-read receipt” later).
- Paid cloud document AI.

## Verify

- Scan/upload a Save-On receipt → wizard shows product rows + total/merchant/date.
- User can edit a bad OCR name before save; saved expense shows those line items on edit.
- Rebuild web `dist` after mobile changes.
