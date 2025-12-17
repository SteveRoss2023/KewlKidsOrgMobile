# Deep Linking Testing Guide

## 1. Test Backend Mobile Detection

### Option A: Using Browser Developer Tools
1. Open your browser's developer tools (F12)
2. Go to Network tab
3. Send an invitation email
4. Click the invitation link
5. Check the redirect response - look for `Location` header:
   - **Mobile User-Agent**: Should redirect to `kewlkids://...`
   - **Desktop User-Agent**: Should redirect to `http://localhost:8081/...` or your web app URL

### Option B: Using curl with Mobile User-Agent
```bash
# Test invitation link with mobile user-agent
curl -I "http://localhost:8900/api/invitations/accept/?token=YOUR_TOKEN&email=test@example.com" \
  -H "User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15"

# Check the Location header in the response
# Should see: Location: kewlkids:///(auth)/register?...
```

### Option C: Test in Django Admin
1. Go to Django admin
2. Find an invitation
3. Copy the invitation URL
4. Test it with different user agents using a tool like Postman or browser extensions

## 2. Test in Expo Go (Current Setup)

### What to Test:
1. **Send invitation email** - Use the app to invite a test user
2. **Click email link on phone** - Should open in browser, then redirect to web app
3. **Verify web app works** - Should show login/register with pre-filled email

### Expected Behavior:
- ✅ Email link opens in browser
- ✅ Browser redirects to web app (localhost:8081 or ngrok URL)
- ✅ Web app shows correct screen with parameters
- ❌ Deep link won't open app (Expo Go limitation - this is expected)

## 3. Test Deep Link Format (Manual)

### Check Redirect URLs:
After clicking email link on mobile, check:
- Browser address bar (before redirect)
- Network tab in browser dev tools
- Should see redirect to: `kewlkids:///(auth)/register?invitation_token=...`

### Test Deep Link Manually (After Build):
Once you have a development build:
```bash
# iOS Simulator
xcrun simctl openurl booted "kewlkids:///(auth)/login?email=test@example.com"

# Android Emulator
adb shell am start -W -a android.intent.action.VIEW -d "kewlkids:///(auth)/login?email=test@example.com"

# Physical Device (iOS)
# Use Safari to navigate to: kewlkids:///(auth)/login?email=test@example.com

# Physical Device (Android)
# Use adb: adb shell am start -W -a android.intent.action.VIEW -d "kewlkids:///(auth)/login?email=test@example.com"
```

## 4. Test After Development Build

### Steps:
1. **Build development build** (using EAS or locally)
2. **Install on device**
3. **Send invitation/verification email**
4. **Click email link on device**
5. **Verify app opens** and navigates to correct screen

### What to Verify:
- ✅ App opens when clicking email link
- ✅ Navigates to correct screen (login/register/home)
- ✅ URL parameters are passed correctly (email pre-filled, etc.)
- ✅ Modals/messages display correctly

## 5. Test Different Scenarios

### Invitation Scenarios:
- [ ] New user (doesn't exist) → Should go to register
- [ ] Existing user (not logged in) → Should go to login
- [ ] Existing user (logged in) → Should auto-accept
- [ ] Expired invitation → Should show error
- [ ] Already accepted → Should show info message
- [ ] Cancelled invitation → Should show error

### Email Verification Scenarios:
- [ ] Valid token → Should verify and redirect to home
- [ ] Already verified → Should show success message
- [ ] Invalid token → Should show error
- [ ] Expired token → Should show error

## 6. Debugging Tips

### Check Backend Logs:
```bash
# Watch Django logs for redirect URLs
python manage.py runserver
# Look for redirect responses in console
```

### Check Mobile Detection:
Add temporary logging to see what user-agent is detected:
```python
# In _is_mobile_request method, temporarily add:
print(f"User-Agent: {user_agent}")
print(f"Is Mobile: {self._is_mobile_request(request)}")
```

### Test User-Agents:
Common mobile user-agents to test:
- iPhone: `Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15`
- Android: `Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36`

## 7. Quick Test Checklist

- [ ] Send invitation email
- [ ] Click link on desktop → Opens web app
- [ ] Click link on mobile → Redirects to deep link (check URL)
- [ ] Verify deep link format is correct: `kewlkids:///(auth)/...`
- [ ] After build: Click link opens native app
- [ ] After build: App navigates to correct screen
- [ ] After build: Parameters are passed correctly











