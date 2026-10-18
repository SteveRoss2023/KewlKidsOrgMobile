---
name: Deep Linking Implementation
overview: Implement deep linking infrastructure so invitation and email verification links use the kewlkids:// scheme. The code will be ready but won't work in Expo Go - it will work once a development build is created.
todos:
  - id: update-invitation-email-urls
    content: Update backend/families/views.py to generate deep link URLs (kewlkids://) in invitation emails instead of web URLs
    status: pending
  - id: update-verification-email-urls
    content: Update backend/api/views.py to generate deep link URLs in email verification emails
    status: pending
  - id: add-mobile-detection
    content: Add mobile device detection helper methods in both views.py files to distinguish mobile vs desktop requests
    status: pending
  - id: update-api-redirects
    content: Update AcceptInvitationView and EmailVerificationView GET handlers to redirect to deep links for mobile devices, web URLs for desktop
    status: pending
  - id: add-deep-link-listener
    content: Add deep link listener in mobile/app/_layout.tsx to handle incoming deep links when app opens from closed state
    status: pending
  - id: update-email-templates
    content: Update HTML email templates to use deep link URLs and include fallback web URLs for desktop users
    status: pending
---

# Deep Linking Implementation

## Overview

Set up deep linking so invitation and email verification links open the native app using the `kewlkids://` scheme. The infrastructure will be in place but won't function in Expo Go - it will work once a development build is created.

## Changes Required

### 1. Backend: Keep Email URLs Pointing to API Endpoints (No Change to Email Generation)

**File: `backend/families/views.py`**

- **No change needed** to email URL generation (line ~95) - keep using backend API endpoint:
- Current: `f"{request.scheme}://{request.get_host()}/api/invitations/accept/?token={invitation.token}&email={email}"`
- This stays the same - emails will continue to point to the backend API

**File: `backend/api/views.py`**

- **No change needed** to verification email URL generation - keep using backend API endpoint
- Current: Uses web URL with `/api/auth/verify-email/`
- This stays the same - emails will continue to point to the backend API

**Rationale:** By keeping email URLs pointing to backend API endpoints, we get automatic fallback behavior. The backend will intelligently route based on device type.

### 2. Backend: Add Mobile Detection and Smart Redirects

**File: `backend/families/views.py`**

- Add helper method `_is_mobile_request(request)` to detect mobile user agents
- In `AcceptInvitationView.get()`, if mobile device detected, redirect to deep link instead of web URL
- Keep web URL redirects as fallback for desktop browsers

**File: `backend/api/views.py`**

- Add same mobile detection helper
- In `EmailVerificationView.get()`, redirect to deep link for mobile, web URL for desktop

### 3. Mobile App: Add Deep Link Listener

**File: `mobile/app/_layout.tsx`**

- Import `useURL` and `useRouter` from expo-router
- Add `useEffect` to listen for incoming deep links when app is opened
- Handle deep links by navigating to the appropriate route with parameters
- This will work automatically with expo-router's built-in deep linking support, but we should add explicit handling for when the app is opened from a closed state

### 4. Update Email Templates

**File: `backend/families/views.py`**

- Update HTML email template to use deep link URL in the button href
- Add fallback text: "If the app doesn't open, copy this link: [web URL]"

**File: `backend/api/views.py`**

- Update verification email HTML template similarly

## Implementation Details

### Deep Link URL Format

- Invitation (new user): `kewlkids:///(auth)/register?invitation_token={token}&invitation_email={email}&family_name={name}`
- Invitation (existing user): `kewlkids:///(auth)/login?invitation_token={token}&invitation_email={email}`
- Email verification: `kewlkids:///(tabs)?verified=true&email={email}`
- Email verification error: `kewlkids:///(auth)/login?error={message}`

### Mobile Detection

Use Django's `request.META.get('HTTP_USER_AGENT', '')` to detect mobile devices. Common patterns: 'Mobile', 'Android', 'iPhone', 'iPad'.

### Fallback Strategy

- Emails contain deep link URLs
- Backend API endpoints still handle browser clicks
- If mobile device detected → redirect to deep link
- If desktop browser → redirect to web app URL
- This ensures links work in both scenarios

## Testing Notes

- Deep links won't work in Expo Go (limitation of Expo Go)
- Will work once a development build is created
- Can test deep link format manually: `kewlkids:///(auth)/login?email=test@example.com`
- Web fallback will continue to work for desktop users