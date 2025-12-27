# Wireless ADB Setup Guide

This guide explains how to set up and use wireless ADB to build and install the Android app on your phone over Wi-Fi, without needing a USB cable.

## Why Use Wireless ADB?

- ✅ No USB cable needed after initial setup
- ✅ Phone can be anywhere on your Wi-Fi network
- ✅ Easier to test while phone is charging or in a different location
- ✅ Faster workflow - just reconnect and build

## Prerequisites

- Android phone with USB debugging enabled
- Phone and computer on the same Wi-Fi network
- ADB installed (comes with Android Studio)
- Phone connected via USB at least once for initial setup

## Initial Setup (One-Time)

### Step 1: Enable USB Debugging on Your Phone

1. Go to **Settings** → **About phone**
2. Tap **Build number** 7 times to enable Developer options
3. Go back to **Settings** → **Developer options**
4. Enable **USB debugging**
5. When prompted, allow USB debugging

### Step 2: Connect Phone via USB

1. Connect your phone to your computer via USB cable
2. On your phone, accept the "Allow USB debugging?" prompt
3. Check that your phone is detected:
   ```bash
   adb devices
   ```
   You should see your device listed (e.g., `R5CY13WK8JB    device`)

### Step 3: Enable TCP/IP Mode

Once connected via USB, enable wireless ADB:

```bash
adb tcpip 5555
```

**Note:** If you have multiple devices (phone + emulator), specify the device:
```bash
adb -s DEVICE_ID tcpip 5555
```

You should see: `restarting in TCP mode port: 5555`

### Step 4: Get Your Phone's IP Address

**Option A: Using ADB (while USB connected)**
```bash
adb shell "ip addr show wlan0 | grep 'inet ' | head -1 | awk '{print \$2}' | cut -d/ -f1"
```

**Option B: On Your Phone**
- Go to **Settings** → **Wi-Fi**
- Tap on your connected Wi-Fi network
- Look for **IP address** (e.g., `10.0.0.146`)

### Step 5: Connect Wirelessly

Disconnect the USB cable, then connect wirelessly:

```bash
adb connect YOUR_PHONE_IP:5555
```

Replace `YOUR_PHONE_IP` with your phone's IP address (e.g., `adb connect 10.0.0.146:5555`)

### Step 6: Verify Connection

```bash
adb devices
```

You should see your phone listed with its IP address:
```
List of devices attached
10.0.0.146:5555    device
```

**✅ Setup Complete!** You can now disconnect the USB cable permanently.

## Daily Usage

### Reconnecting Wirelessly

If you disconnect your phone or restart it, you'll need to reconnect. You have two options:

#### Option 1: Quick Reconnect Script (Recommended)

Use the helper script:

```powershell
cd C:\dev\kewlkids\mobile
.\scripts\connect-wifi-adb.ps1 YOUR_PHONE_IP
```

Example:
```powershell
.\scripts\connect-wifi-adb.ps1 10.0.0.146
```

#### Option 2: Manual Reconnect

```bash
adb connect YOUR_PHONE_IP:5555
```

**Note:** You don't need to run `adb tcpip 5555` again unless:
- You restart ADB server (`adb kill-server`)
- Your phone's IP address changes
- You factory reset your phone

### Building and Installing

Once connected wirelessly, build and install the app:

```bash
cd C:\dev\kewlkids\mobile
npm run dev:android
```

This will:
1. Build the Android app
2. Install it on your phone over Wi-Fi
3. Start the development server

## Troubleshooting

### "Device Not Found" or Connection Refused

**Problem:** `adb connect` fails or device doesn't appear

**Solutions:**
1. **Check Wi-Fi connection:**
   - Ensure phone and computer are on the same Wi-Fi network
   - Try disconnecting and reconnecting Wi-Fi on your phone

2. **Verify phone's IP address:**
   - Phone IP may have changed (check Settings → Wi-Fi)
   - Reconnect with the new IP: `adb connect NEW_IP:5555`

3. **Restart TCP/IP mode:**
   - Connect via USB temporarily
   - Run: `adb tcpip 5555`
   - Disconnect USB and reconnect wirelessly

4. **Restart ADB server:**
   ```bash
   adb kill-server
   adb start-server
   adb connect YOUR_PHONE_IP:5555
   ```

### Multiple Devices Detected

**Problem:** `adb tcpip 5555` shows "error: more than one device/emulator"

**Solution:** Specify your phone's device ID:
```bash
# First, list devices to get the ID
adb devices

# Then use the device ID
adb -s DEVICE_ID tcpip 5555
```

Example:
```bash
adb -s R5CY13WK8JB tcpip 5555
```

### Phone IP Address Changed

**Problem:** Phone got a new IP address from router

**Solution:**
1. Get the new IP address (see Step 4 above)
2. Reconnect: `adb connect NEW_IP:5555`

**Tip:** Some routers allow you to set a static IP for your phone to prevent this.

### Connection Drops During Build

**Problem:** Wireless connection is unstable

**Solutions:**
1. **Move closer to Wi-Fi router**
2. **Use 5GHz Wi-Fi** if available (faster, more stable)
3. **Temporarily use USB** for critical builds
4. **Check for interference** (microwaves, other devices)

## Quick Reference

### Essential Commands

```bash
# List connected devices
adb devices

# Enable TCP/IP mode (via USB, one-time setup)
adb tcpip 5555

# Connect wirelessly
adb connect YOUR_PHONE_IP:5555

# Disconnect wireless device
adb disconnect YOUR_PHONE_IP:5555

# Get phone's IP address (while USB connected)
adb shell "ip addr show wlan0 | grep 'inet ' | head -1 | awk '{print \$2}' | cut -d/ -f1"

# Restart ADB server
adb kill-server
adb start-server
```

### Your Phone's IP Address

**Current IP:** `10.0.0.146` (may change if router assigns new IP)

**To find it again:**
- Settings → Wi-Fi → Tap your network → View IP address
- Or use the ADB command above while USB connected

### Helper Script

**Location:** `mobile/scripts/connect-wifi-adb.ps1`

**Usage:**
```powershell
cd C:\dev\kewlkids\mobile
.\scripts\connect-wifi-adb.ps1 10.0.0.146
```

**Note:** This document is located in the `Docs/` folder for easy reference.

## When to Re-run Initial Setup

You only need to re-run the initial setup (`adb tcpip 5555`) if:

- ✅ You restart the ADB server (`adb kill-server`)
- ✅ Your phone's IP address changes and you can't reconnect
- ✅ You factory reset your phone
- ✅ You switch to a different Wi-Fi network (may need to reconnect)

**You DON'T need to re-run it if:**
- ❌ You just disconnect/reconnect your phone
- ❌ You restart your phone (just reconnect: `adb connect IP:5555`)
- ❌ You restart your computer (just reconnect: `adb connect IP:5555`)

## Tips

1. **Save your phone's IP address** - Write it down or save it somewhere easy to find
2. **Use the helper script** - Makes reconnecting quick and easy
3. **Check connection before building** - Run `adb devices` to verify before `npm run dev:android`
4. **Keep phone on same Wi-Fi** - Switching networks may require reconnection
5. **USB as backup** - Keep a USB cable handy for troubleshooting

## Summary

**Initial Setup (One-Time):**
1. Connect via USB
2. Run `adb tcpip 5555`
3. Get phone's IP address
4. Run `adb connect IP:5555`
5. Disconnect USB

**Daily Usage:**
1. Reconnect: `adb connect IP:5555` (or use helper script)
2. Build: `npm run dev:android`

That's it! Enjoy wireless Android development! 🚀

