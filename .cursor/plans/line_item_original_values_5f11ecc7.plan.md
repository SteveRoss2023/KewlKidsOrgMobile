---
name: Line item original values
overview: Preserve original receipt line-item names and amounts through Gemini/FX, then show them muted under the English/CAD values in LineItemsEditor only when translation or conversion occurred.
todos:
  - id: gemini-original-name
    content: Add original_name to Gemini line_items + normalize
    status: completed
  - id: fx-original-line
    content: Preserve original_unit_price/line_total before CAD convert
    status: completed
  - id: line-editor-ui
    content: DraftLineItem + LineItemsEditor muted originals; wire from scan/form
    status: completed
isProject: false
---

# Line items: show original under CAD/English

Yes — that makes sense. Today FX overwrites line prices and Gemini only keeps English names, so the UI has nothing to show underneath. We’ll keep originals through parse and render them only when they differ.

## Backend

### Gemini — [`backend/expenses/receipt_gemini.py`](backend/expenses/receipt_gemini.py)

Extend each `line_items[]` entry:

- `name` — English (as today)
- `original_name` — text as printed on the receipt (null if already English / same as `name`)

Normalize both in `_normalize_gemini_payload`.

### FX — [`backend/expenses/receipt_fx.py`](backend/expenses/receipt_fx.py)

Before converting each line’s money fields, copy:

- `original_unit_price` / `original_line_total` from current values
Then set `unit_price` / `line_total` to CAD (as today).
Leave `original_*` alone when currency is already CAD or FX fails.

## Mobile types

[`mobile/types/expenses.ts`](mobile/types/expenses.ts) — on parse line items add optional:

- `original_name`, `original_unit_price`, `original_line_total`

## LineItemsEditor — [`mobile/components/expenses/LineItemsEditor.tsx`](mobile/components/expenses/LineItemsEditor.tsx)

- Extend `DraftLineItem` with optional read-only originals + `original_currency?: string`
- `draftLinesFromExpenseItems` accepts/passes those fields (plus currency from parse)
- Under each editable column, when present and different, show muted secondary text:
  - **Name:** original language name
  - **Unit / Total:** e.g. `EUR 12.50` (not under Qty)
- No original row when English-only and CAD (no conversion)

Wire currency into drafts from [`ReceiptScanWizard.tsx`](mobile/components/expenses/ReceiptScanWizard.tsx) / [`ExpenseForm.tsx`](mobile/components/expenses/ExpenseForm.tsx) when building lines from parse (small helper arg or attach currency on each item in the mapper).

## Out of scope

- Persisting original line names/amounts on `ExpenseLineItem` in the DB (expense still stores CAD lines; originals remain on the expense via `original_currency` / `original_amount` + notes)
- Changing the 3-column edit controls themselves
