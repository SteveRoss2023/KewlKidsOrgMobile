---
name: Flatten accounts UI
overview: Replace nested collapses and the account detail modal with an always-visible institution-grouped list. Tap an account to expand balance history inline under that row, with edit/delete on history items; keep Update balances, Add, and account edit/delete.
todos:
  - id: flatten-render
    content: "Rewrite renderAccounts: always-visible portfolio + institution groups; remove nested collapse and AccountDetailModal wiring"
    status: completed
  - id: inline-history
    content: Expand account row to show History list under it with edit/delete per snapshot; account edit/delete on expanded header
    status: completed
  - id: snapshot-delete
    content: Add moneyService.deleteSnapshot + confirm delete for history rows (API already supports DELETE)
    status: completed
  - id: web-build
    content: Run mobile web build after UI changes
    status: completed
isProject: false
---

# Flatten Accounts tab UI (inline history)

## Problem
Nested collapses hide balances, and tapping an account opens a modal. Prefer one scrollable view: portfolio visible immediately, history expands under the account.

## Target layout

```
[ Update balances ]

Portfolio · N accounts          $grandTotal     [Add]

BMO · 2                         $institutionTotal
  ▼ RRSP name · as of …         $balance
      History
      Jan 1, 2026   $…   [edit] [delete]
      Dec 1, 2025   $…   [edit] [delete]
      [Update balance]  [Edit account]  [Delete account]
  ▶ TFSA name · as of …         $balance

Sun Life · 1                    $institutionTotal
  ▶ …

Other · …                       …
```

- Portfolio total + all institutions + all accounts always visible (no outer/institution collapse).
- Institution headers are static labels (name, count, total).
- Tap account row toggles inline expand (chevron down/right). Only one account expanded at a time (or allow multiple — use one at a time to keep the list short).
- Expanded block shows **History** sorted newest-first; each snapshot row has edit (existing snap form) and delete (new, with confirm).
- Account-level Update balance / Edit / Delete live in the expanded footer (same actions the modal had).
- Empty state unchanged.

## Functionality map

- Update all balances — top wizard (unchanged)
- Add account — portfolio header Add
- Single-account balance update — expanded footer → existing `openSnapForm(a)`
- Edit / delete account — expanded footer → existing edit form / delete confirm
- Edit snapshot — history edit → existing `openSnapForm(a, snap)`
- Delete snapshot — history delete → new `moneyService.deleteSnapshot` + confirm (ViewSet already supports DELETE; client method missing today)
- Show/hide amounts / demo overlay — existing helpers

## Modal

Stop using [`AccountDetailModal`](mobile/components/money/AccountDetailModal.tsx) from the Accounts tab. Leave the component file in place unused for now (no drive-by delete unless nothing else imports it).

## Code changes

Primary: [`mobile/app/(tabs)/money.tsx`](mobile/app/(tabs)/money.tsx)

1. Remove `accountsExpanded`, `expandedInstitutionKeys`, and related toggles/focus resets.
2. Add `expandedAccountId: number | null` for inline history.
3. Rebuild `renderAccounts` to the layout above; filter `snapshots` by account for the expanded history list.
4. Wire history edit/delete and account actions; add snapshot delete confirm state (mirror account delete `AlertModal` pattern).
5. Remove `<AccountDetailModal … />` usage and `showAccountDetail` / reopen-after-snap paths that only served the modal (keep snap form; after save just `load()` and leave the account expanded).

Service: [`mobile/services/moneyService.ts`](mobile/services/moneyService.ts) — add `deleteSnapshot(id)`.

6. Run `npm run build` in `mobile`.

YTD / Target / Income out of scope.
