---
name: Navigation Structure Migration Plan
overview: Plan to replicate the reference project's navigation structure (global navbar, family selector, tabbed family detail view) in React Native using Expo Router, matching the web app's navigation patterns.
todos:
  - id: create-family-context
    content: Create FamilyContext for global family selection state
    status: completed
  - id: create-family-selector
    content: Create FamilySelector component with dropdown/picker
    status: completed
    dependencies:
      - create-family-context
  - id: create-global-navbar
    content: Create GlobalNavBar component with logo, today, family selector, settings, user avatar
    status: completed
    dependencies:
      - create-family-selector
  - id: create-settings-menu
    content: Create SettingsMenu component with dropdown and submenu for services
    status: completed
  - id: refactor-family-detail-tabs
    content: Convert families/[id].tsx to tabbed interface with Profile, Members, Invitations, Storage tabs
    status: completed
  - id: create-family-tab-components
    content: "Create tab components: FamilyProfileTab, FamilyMembersTab, FamilyInvitationsTab, FamilyStorageTab"
    status: completed
    dependencies:
      - refactor-family-detail-tabs
  - id: update-root-layout
    content: Add FamilyContext provider to root layout
    status: completed
    dependencies:
      - create-family-context
  - id: update-tabs-layout
    content: Add GlobalNavBar to tabs layout or individual screens
    status: completed
    dependencies:
      - create-global-navbar
  - id: test-navigation-flow
    content: Test all navigation routes and verify family selection works globally
    status: pending
    dependencies:
      - update-root-layout
      - update-tabs-layout
  - id: add-role-based-ui
    content: Add role-based UI controls to show/hide buttons based on user permissions
    status: completed
    dependencies:
      - refactor-family-detail-tabs
---

# Navigation Structure Migration Plan

## Reference Project Navigation Analysis

### Global Navigation (from App.jsx)

**Navbar Structure:**

1. **Left Section:**

   - Logo button (navigates to home)
   - Today icon button (navigates to today view)

2. **Center Section:**

   - FamilySelector dropdown (always visible, allows switching active family)

3. **Right Section:**

   - Dark mode toggle button
   - Settings dropdown menu with:
     - Profile
     - Voice Settings
     - Grocery Categories
     - Services submenu (Outlook Sync, OneDrive, Google Drive, Google Photos)
     - Logout
   - User avatar/photo button (navigates to profile)

**Main Content Area:**

- Single-page app with state-based view switching (`activeView` state)
- Views: home, families, calendar, lists, chat, meals, documents, finance, map, today, profile, settings, etc.
- Footer with copyright info

### Families Navigation (from Families.jsx)

**Two-State Navigation:**

1. **List View** (default):

   - Table of all families
   - Create family form/button
   - Clicking a family row opens detail view

2. **Detail View** (when `viewingFamilyId` is set):

   - Header with family name (colored) and delete button (owner only)
   - **Tab Navigation** with 4 tabs:
     - **Profile Tab**: Edit family name/color (owner/admin) or view-only (members)
     - **Members Tab**: List members, change roles, remove members (admin actions)
     - **Invitations Tab**: Send invitations, view/cancel pending invitations (admin only)
     - **Storage Tab**: Storage usage breakdown by document type
   - Back button to return to list view

**Key Features:**

- Tab-based navigation within family detail
- Role-based UI (owner/admin see edit controls, members see view-only)
- Modal-like overlay (detail view replaces list view)
- State management: `viewingFamilyId` and `activeTab` control navigation

---

## React Native Navigation Plan

### Current Mobile App Structure

**Current Navigation:**

- Root Stack (`_layout.tsx`) - handles auth vs main app
- Auth Stack (`(auth)/_layout.tsx`) - login/register
- Tabs Layout (`(tabs)/_layout.tsx`) - bottom tabs (Home, Families)
- Families screens: list, detail, create

**Issues:**

- No global navbar component
- No family selector in global nav
- Family detail is a separate screen, not tabbed
- No settings/profile access from global nav
- Missing today view navigation

---

## Implementation Plan

### Phase 1: Create Global Navigation Component

**File**: `mobile/components/GlobalNavBar.tsx`

**Features:**

- Logo button (navigate to home)
- Today button (navigate to today - when implemented)
- FamilySelector component (center)
- Dark mode toggle
- Settings menu (dropdown/modal)
- User avatar button (navigate to profile)
- Logout functionality

**Implementation:**

- Use React Native components: `View`, `TouchableOpacity`, `Modal` for dropdown
- Position: Fixed at top of screen
- Style: Match reference design (horizontal layout, proper spacing)
- Integrate with Expo Router for navigation

### Phase 2: Create FamilySelector Component

**File**: `mobile/components/FamilySelector.tsx`

**Features:**

- Dropdown/picker to select active family
- Shows family name and color indicator
- Auto-selects first family if none selected
- Updates global selectedFamily state
- Accessible from all screens via context

**Implementation:**

- Use `Picker` or custom dropdown with `Modal`
- Store selectedFamily in React Context
- Update when families list changes
- Show loading state while fetching

### Phase 3: Refactor Families Navigation

**Current**: Separate screens (list → detail → create)

**New Structure**: Tabbed detail view within families screen

**Files to Create/Modify:**

1. **`mobile/app/(tabs)/families.tsx`** (List View)

   - Show families list
   - Create family button
   - Click family → navigate to detail with tabs

2. **`mobile/app/(tabs)/families/[id].tsx`** (Detail View with Tabs)

   - Convert to tabbed interface
   - Add tab navigation: Profile, Members, Invitations, Storage
   - Each tab as separate component or conditional render
   - Back button to return to list

3. **Tab Components:**

   - `mobile/components/families/FamilyProfileTab.tsx`
   - `mobile/components/families/FamilyMembersTab.tsx`
   - `mobile/components/families/FamilyInvitationsTab.tsx`
   - `mobile/components/families/FamilyStorageTab.tsx`

**Navigation Flow:**

```
Families List → [Click Family] → Family Detail (Tabs)
                                    ├─ Profile Tab
                                    ├─ Members Tab
                                    ├─ Invitations Tab
                                    └─ Storage Tab
```

### Phase 4: Create Settings Menu Component

**File**: `mobile/components/SettingsMenu.tsx`

**Features:**

- Modal/dropdown menu
- Menu items:
  - Profile
  - Voice Settings
  - Grocery Categories
  - Services (submenu):
    - Outlook Sync
    - OneDrive Connect
    - Google Drive Connect
    - Google Photos Connect
  - Logout
- Show connection status indicators (green/red dots)
- Navigate to respective screens

### Phase 5: Create Family Context

**File**: `mobile/contexts/FamilyContext.tsx`

**Features:**

- Global state for `selectedFamily`
- Provider wraps app
- Functions: `setSelectedFamily`, `getSelectedFamily`
- Auto-select first family on load
- Persist selection in AsyncStorage

### Phase 6: Update Root Layout

**File**: `mobile/app/_layout.tsx`

**Changes:**

- Wrap app with FamilyContext.Provider
- Add GlobalNavBar to authenticated screens
- Handle family selector state

### Phase 7: Update Tabs Layout

**File**: `mobile/app/(tabs)/_layout.tsx`

**Changes:**

- Add GlobalNavBar at top (or in each screen)
- Ensure family selector is accessible
- Add settings/profile navigation

---

## File Structure

```
mobile/
├── components/
│   ├── GlobalNavBar.tsx          # NEW - Global navigation bar
│   ├── FamilySelector.tsx        # NEW - Family dropdown selector
│   ├── SettingsMenu.tsx          # NEW - Settings dropdown menu
│   └── families/
│       ├── FamilyProfileTab.tsx  # NEW - Profile tab content
│       ├── FamilyMembersTab.tsx  # NEW - Members tab content
│       ├── FamilyInvitationsTab.tsx # NEW - Invitations tab content
│       └── FamilyStorageTab.tsx  # NEW - Storage tab content
├── contexts/
│   └── FamilyContext.tsx         # NEW - Global family state
├── app/
│   ├── _layout.tsx               # MODIFY - Add FamilyContext provider
│   └── (tabs)/
│       ├── _layout.tsx           # MODIFY - Add GlobalNavBar
│       └── families/
│           ├── families.tsx      # MODIFY - List view only
│           └── [id].tsx          # MODIFY - Convert to tabbed view
```

---

## Implementation Details

### GlobalNavBar Component

```typescript
// Structure:
<View style={styles.navbar}>
  <TouchableOpacity onPress={() => router.push('/(tabs)')}>
    <Logo />
  </TouchableOpacity>
  <TouchableOpacity onPress={() => router.push('/(tabs)/today')}>
    <TodayIcon />
  </TouchableOpacity>
  <FamilySelector />
  <TouchableOpacity onPress={toggleDarkMode}>
    <DarkModeIcon />
  </TouchableOpacity>
  <SettingsMenu />
  <TouchableOpacity onPress={() => router.push('/(tabs)/profile')}>
    <UserAvatar />
  </TouchableOpacity>
</View>
```

### Family Detail Tabs

**Option 1: Use React Native TabView**

- Install `react-native-tab-view`
- Create tabs: Profile, Members, Invitations, Storage
- Each tab renders appropriate component

**Option 2: Custom Tab Implementation**

- Use `ScrollView` with horizontal scrolling
- Tab buttons at top
- Conditional rendering based on `activeTab` state
- Animate tab switching

**Recommended**: Option 2 (custom) for more control and lighter weight

### Navigation State Management

**Family Detail Screen State:**

```typescript
const [activeTab, setActiveTab] = useState<'profile' | 'members' | 'invitations' | 'storage'>('profile')
```

**Global Family Selection:**

```typescript
// FamilyContext.tsx
const FamilyContext = createContext<{
  selectedFamily: Family | null
  setSelectedFamily: (family: Family | null) => void
}>({ selectedFamily: null, setSelectedFamily: () => {} })
```

---

## Migration Steps

1. **Create FamilyContext** - Global state for selected family
2. **Create FamilySelector** - Dropdown component
3. **Create GlobalNavBar** - Main navigation bar
4. **Create SettingsMenu** - Settings dropdown
5. **Refactor families/[id].tsx** - Convert to tabbed interface
6. **Create tab components** - Profile, Members, Invitations, Storage
7. **Update root layout** - Add context provider
8. **Update tabs layout** - Add GlobalNavBar
9. **Test navigation flow** - Verify all routes work
10. **Add role-based UI** - Show/hide based on user permissions

---

## Key Differences: Web vs Mobile

**Web (Reference):**

- Single-page app with state-based view switching
- Navbar always visible at top
- Family detail uses tabs within same component
- Modal-like overlay (detail replaces list)

**Mobile (React Native):**

- File-based routing with Expo Router
- GlobalNavBar component (can be in layout or each screen)
- Family detail as separate route with internal tabs
- Stack navigation (list → detail → back)

**Adaptation Strategy:**

- Use Expo Router's file-based routing
- Create reusable GlobalNavBar component
- Use Stack navigation for families (list → detail)
- Implement tab navigation within detail screen
- Use Context API for global family selection

---

## Testing Checklist

- [ ] GlobalNavBar appears on all authenticated screens
- [ ] FamilySelector works and updates global state
- [ ] Settings menu opens and navigates correctly
- [ ] Family list → detail navigation works
- [ ] Family detail tabs switch correctly
- [ ] Back button returns to list
- [ ] Role-based UI shows/hides correctly
- [ ] Selected family persists across navigation
- [ ] Dark mode toggle works
- [ ] User avatar navigates to profile

---

## Next Steps After Navigation

Once navigation is complete:

1. Implement missing families features (edit, invite, etc.)
2. Add role-based permissions to UI
3. Complete other feature migrations (calendar, lists, etc.)