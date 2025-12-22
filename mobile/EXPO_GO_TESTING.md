# Testing with Expo Go on Your Phone

## Quick Start

### Step 1: Install Expo Go on Your Phone

**For Android:**
- Open Google Play Store
- Search for "Expo Go"
- Install the app

**For iOS:**
- Open App Store
- Search for "Expo Go"
- Install the app

### Step 2: Start the Development Server

From your project directory:

```bash
cd C:\dev\kewlkids\mobile
npm start
```

This will:
- Start the Metro bundler
- Display a QR code in the terminal
- Show connection options (LAN, Tunnel, Localhost)

### Step 3: Connect Your Phone

**Option A: Same Wi-Fi Network (Recommended)**
1. Make sure your phone and computer are on the same Wi-Fi network
2. In the Expo terminal, press `s` to switch to LAN mode (if not already)
3. Open Expo Go app on your phone
4. Scan the QR code displayed in the terminal
   - **Android**: Use the "Scan QR code" button in Expo Go
   - **iOS**: Use the Camera app to scan the QR code
5. The app should load on your phone!

**Option B: Tunnel (If Same Network Doesn't Work)**
1. In the Expo terminal, press `s` to switch to Tunnel mode
2. Wait for tunnel to establish (may take a minute)
3. Scan the QR code with Expo Go
4. The app will load through the tunnel

**Option C: Manual Connection**
1. In Expo Go, tap "Enter URL manually"
2. Enter the URL shown in the terminal (e.g., `exp://192.168.1.100:8081`)

### Step 4: Test the App

Once connected, you can:
- ✅ Navigate through all screens
- ✅ Test lists, calendar, maps, etc.
- ✅ Test drag-and-drop functionality
- ✅ Test API connections (make sure backend is running)
- ⚠️ **Voice recognition won't work** (requires development build, but won't crash)

## Important Notes

### Voice Recognition Limitation
- The app uses `@react-native-voice/voice` which requires native code
- **Expo Go doesn't support this package**
- The app handles this gracefully - voice features will be disabled but won't crash
- To test voice recognition, you'll need a development build (see `DEV_BUILD_INSTRUCTIONS.md`)

### Backend Connection
Make sure your Django backend is running:
```bash
cd C:\dev\kewlkids\backend
.\venv\Scripts\activate
python manage.py runserver 8900
```

If using ngrok for external access:
```bash
ngrok http 8900 --domain=kewlkidsorganizermobile.ngrok.app
```

### Troubleshooting

**Can't Connect?**
- Make sure phone and computer are on the same Wi-Fi
- Try Tunnel mode (press `s` in Expo terminal)
- Check firewall settings on your computer
- Try restarting the Expo server: `npm start --clear`

**App Won't Load?**
- Check that Metro bundler is running
- Look for errors in the terminal
- Try clearing cache: `npm start --clear`

**Backend Not Connecting?**
- Verify backend is running on port 8900
- Check API URL in app configuration
- If using ngrok, make sure it's running

## Keyboard Shortcuts in Expo Terminal

- `s` - Switch between LAN/Tunnel/Localhost
- `r` - Reload app
- `m` - Toggle menu
- `j` - Open debugger
- `c` - Clear cache and restart

## Next Steps

Once you've tested with Expo Go:
- If you need voice recognition, create a development build (see `DEV_BUILD_INSTRUCTIONS.md`)
- For production testing, use EAS Build or local development build
- Most other features work perfectly in Expo Go!

