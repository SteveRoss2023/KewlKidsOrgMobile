---
name: Checklist overflow menu on web
overview: Extend the existing mobile overflow menu for checklist section headers and items so it also shows in the web app when the layout is mobile-width, while keeping the current full icon strip on wider desktop web.
todos:
  - id: add-layout-hook
    content: Add useIsMobileLayout hook (or equivalent) using useWindowDimensions and Platform to detect mobile layout on web
    status: completed
  - id: wire-hook-sectionrow
    content: Update SectionRow to use isMobileLayout instead of Platform.OS for deciding between overflow menu and icon buttons
    status: completed
  - id: wire-hook-listitem
    content: Update ListItemComponent to use isMobileLayout for checklist overflow menu vs inline buttons
    status: completed
  - id: test-native-and-web
    content: Manually test sections and checklist items on native and on web at narrow and wide widths
    status: completed
isProject: false
---

### Goal

Extend the **checklist overflow menu** (⋮) for section headers and items so it appears in the **web app when the viewport is mobile-sized**, while preserving the current full icon strip on wider desktop web.

---

### 1. Introduce a shared "mobile layout" helper

- **File:** create or extend a simple hook in something like `[mobile/hooks/useIsMobileLayout.ts](mobile/hooks/useIsMobileLayout.ts)` (or another small shared utilities file if you already have one).
- **Implementation idea:**
  - Use `useWindowDimensions` from `react-native`:

```ts
    import { useWindowDimensions, Platform } from 'react-native';

    export function useIsMobileLayout(breakpoint: number = 768) {
      const { width } = useWindowDimensions();
      if (Platform.OS === 'ios' || Platform.OS === 'android') return true;
      // Web: treat narrow viewports as mobile layout
      return width < breakpoint;
    }


```

- This keeps the **native behavior unchanged** (always considered mobile layout), and on **web** treats only narrow widths (e.g. `< 768`) as mobile.
- Make the breakpoint a parameter if you think you may tweak it later.

---

### 2. Update `SectionRow` to use layout helper instead of `Platform.OS`

- **File:** `[mobile/components/lists/SectionRow.tsx](mobile/components/lists/SectionRow.tsx)`
- **Current behavior (from earlier work):**
  - Uses a flag like `showSectionOverflowMenu = Platform.OS !== 'web'` to show the ⋮ menu only on native.
  - Web always gets the individual edit/delete/indent/outdent buttons with tooltips.
- **Planned change:**
  - Import the new hook and compute:

```ts
    const isMobileLayout = useIsMobileLayout();


```

- Replace `showSectionOverflowMenu` / `Platform.OS !== 'web'` checks with `isMobileLayout`:
  - **If `isMobileLayout` is true:** show the **single ⋮ overflow button** and hide the four section action icons.
  - **If `isMobileLayout` is false:** show the **existing full icon strip** (edit, delete, outdent, indent, chevron) exactly as on today’s desktop web.
- Keep `Alert.alert` menu contents, accessibility labels, and the chevron/section title layout unchanged.
- Ensure that the web-only tooltip `useEffect` continues to run **only for non-mobile layout on web** (so you still get hover titles on the icon strip when in desktop layout).

---

### 3. Update `ListItemComponent` to use layout helper for checklist items

- **File:** `[mobile/components/lists/ListItemComponent.tsx](mobile/components/lists/ListItemComponent.tsx)`
- **Current behavior (from previous implementation):**
  - On native (`Platform.OS !== 'web'` and checklist actions present) it shows the ⋮ overflow button for checklist items and hides the inline `itemActionsInline` strip.
  - On web, checklist items always show the inline icon strip on the right.
- **Planned change:**
  - Import and use the helper:

```ts
    const isMobileLayout = useIsMobileLayout();


```

- Redefine the menu flag as something like:

```ts
    const useChecklistOverflowMenu = isMobileLayout && (onIndent != null || onOutdent != null);


```

- Rendering rules:
  - **If `useChecklistOverflowMenu` is true:**
    - Show the single ⋮ button next to the item name.
    - Use the existing `openItemMenu` `Alert.alert` implementation (Edit, Move to list, Delete, Indent/Outdent respecting `canIndent`/`canOutdent`, Cancel).
    - Do **not** render `itemActionsInline` for that item.
  - **If `useChecklistOverflowMenu` is false:**
    - Keep the existing behavior:
      - On native non-checklist: inline `itemActionsInline` strip.
      - On web non-mobile-layout: right-hand desktop icon strip (edit/move/delete/etc.).
- Ensure the **item name layout is unchanged**:
  - Name stays in `itemNameRow` with the same flex/truncation.
  - Only the right-hand action area swaps between ⋮ and icon strip depending on `isMobileLayout`.

---

### 4. Preserve desktop web UX and tooltips

- **SectionRow:**
  - Keep the web-only refs and tooltip `useEffect` as-is, but gate them on `Platform.OS === 'web' && !isMobileLayout` so tooltips only apply when the desktop-style icon strip is visible.
- **ListItemComponent:**
  - Leave the existing web action strip (the right-side buttons) and their tooltips for non-mobile layout untouched.
  - Ensure that any web-specific props (like `data-no-drag` and `onMouseDown` suppression for drag handles) remain on the right-hand buttons that are still rendered in desktop layout.

---

### 5. Testing strategy

- **Native (Android/iOS via Expo):**
  - Verify that behavior is unchanged: sections and checklist items still show the ⋮ overflow menu; web-only refs/tooltip logic do not affect native.
- **Web – mobile-width viewport:**
  - Open the app in the browser, narrow the window to `< 768px`.
  - Confirm:
    - Section headers show the **single ⋮** instead of four icons; menu options act correctly.
    - Checklist items show the ⋮ next to the name; edit/delete/indent/outdent all work.
- **Web – desktop-width viewport:**
  - Widen the browser window above the breakpoint.
  - Confirm:
    - Section headers revert to **four individual buttons** with tooltips.
    - Checklist items use the existing web icon strips and behavior.
  - Check that switching window size at runtime updates the layout (thanks to `useWindowDimensions`).

---

### 6. Optional refinements

- Make the breakpoint (e.g. 768) configurable via a constants file (e.g. `[mobile/constants/layout.ts](mobile/constants/layout.ts)`), shared by both `SectionRow` and `ListItemComponent` and any future responsive components.
- If you want smoother control, consider a small responsive hook (e.g. `useBreakpoint` returning `isMobile`, `isTablet`, `isDesktop`) and have `useIsMobileLayout` call that, but this is not required for the first pass.

