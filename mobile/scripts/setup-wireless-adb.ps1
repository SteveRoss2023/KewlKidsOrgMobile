# Wireless ADB Setup Script
# This script helps set up wireless ADB connection without requiring USB cable
# Works with Android 11+ wireless debugging feature

param(
    [Parameter(Mandatory=$false)]
    [string]$PhoneIP,

    [Parameter(Mandatory=$false)]
    [string]$PairingCode,

    [Parameter(Mandatory=$false)]
    [int]$Port = 5555
)

Write-Host "`n=== Wireless ADB Setup ===" -ForegroundColor Cyan
Write-Host ""

# Check if ADB is available
$adbPath = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adbPath) {
    Write-Host "ERROR: ADB not found in PATH!" -ForegroundColor Red
    Write-Host "Please install Android Studio or add ADB to your PATH." -ForegroundColor Yellow
    Write-Host "ADB is usually located at: C:\Users\$env:USERNAME\AppData\Local\Android\Sdk\platform-tools\adb.exe" -ForegroundColor Yellow
    exit 1
}

# Check current devices
Write-Host "Checking current ADB connections..." -ForegroundColor Cyan
$devices = adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "device" -or $_ -match "unauthorized" }
$usbDevices = $devices | Where-Object { $_ -notmatch ":" }
$wirelessDevices = $devices | Where-Object { $_ -match ":" }

if ($wirelessDevices) {
    Write-Host "[OK] Wireless device already connected:" -ForegroundColor Green
    $wirelessDevices | ForEach-Object { Write-Host "  $_" -ForegroundColor Green }
    Write-Host "`nYou're all set! Run npm run dev:android to build." -ForegroundColor Green
    exit 0
}

# Method 1: Wireless Debugging (Android 11+) - No USB needed!
Write-Host "`n=== Method 1: Wireless Debugging (Android 11+) ===" -ForegroundColor Cyan
Write-Host "This method works WITHOUT a USB cable!" -ForegroundColor Yellow
Write-Host ""
Write-Host "On your phone:" -ForegroundColor Yellow
Write-Host "1. Go to Settings -> Developer options" -ForegroundColor White
Write-Host "2. Enable Wireless debugging" -ForegroundColor White
Write-Host "3. Tap Wireless debugging -> Pair device with pairing code" -ForegroundColor White
Write-Host "4. You'll see a 6-digit code and an IP address with port (e.g. 192.168.1.100:12345)" -ForegroundColor White
Write-Host ""

if ($PairingCode -and $PhoneIP) {
    # Extract IP and port from PhoneIP if it includes port
    if ($PhoneIP -match "^(.+):(\d+)$") {
        $pairingIP = $matches[1]
        $pairingPort = $matches[2]
    } else {
        Write-Host "ERROR: PhoneIP should include port for pairing (e.g. 192.168.1.100:12345)" -ForegroundColor Red
        exit 1
    }

    Write-Host "Pairing with code $PairingCode at ${pairingIP}:${pairingPort}..." -ForegroundColor Cyan
    $pairResult = adb pair "$pairingIP`:$pairingPort" $PairingCode 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Pairing successful!" -ForegroundColor Green

        # Now get the connection port from wireless debugging settings
        Write-Host "`nOn your phone, go to:" -ForegroundColor Yellow
        Write-Host "Settings -> Developer options -> Wireless debugging -> IP address & port" -ForegroundColor White
        Write-Host "You'll see something like: 192.168.1.100:37095" -ForegroundColor White
        Write-Host ""
        $connectIP = Read-Host "Enter the IP address and port (e.g. 192.168.1.100:37095)"

        if ($connectIP) {
            Write-Host "Connecting to $connectIP..." -ForegroundColor Cyan
            adb connect $connectIP

            Write-Host "`nChecking connection..." -ForegroundColor Cyan
            adb devices

            $connected = adb devices | Select-String -Pattern "$connectIP.*device"
            if ($connected) {
                Write-Host "`n[OK] Successfully connected wirelessly!" -ForegroundColor Green
                Write-Host "You can now run npm run dev:android to build." -ForegroundColor Green
                exit 0
            }
        }
    } else {
        Write-Host "Pairing failed. Please check the code and IP address." -ForegroundColor Red
    }
} else {
    Write-Host "To use this method, run:" -ForegroundColor Yellow
    Write-Host "  .\scripts\setup-wireless-adb.ps1 -PhoneIP `"192.168.1.100:12345`" -PairingCode `"123456`"" -ForegroundColor White
    Write-Host ""
    Write-Host "Where:" -ForegroundColor Yellow
    Write-Host "  -PhoneIP is the IP:port shown in Pair device with pairing code" -ForegroundColor White
    Write-Host "  -PairingCode is the 6-digit code shown on your phone" -ForegroundColor White
    Write-Host ""
}

# Method 2: Traditional TCP/IP (requires USB for initial setup)
Write-Host "`n=== Method 2: Traditional TCP/IP (requires USB) ===" -ForegroundColor Cyan
Write-Host "This method requires USB connection for initial setup." -ForegroundColor Yellow
Write-Host ""

if ($usbDevices) {
    Write-Host "[OK] USB device detected!" -ForegroundColor Green
    $usbDevices | ForEach-Object { Write-Host "  $_" -ForegroundColor Green }
    Write-Host ""

    # Get device ID if multiple devices
    $deviceId = $null
    if (($usbDevices | Measure-Object).Count -gt 1) {
        Write-Host "Multiple devices detected. Please select one:" -ForegroundColor Yellow
        $usbDevices | ForEach-Object { $i = 0 } { $i++; Write-Host "$i. $_" }
        $selection = Read-Host "Enter number"
        $deviceId = ($usbDevices | Select-Object -Index ([int]$selection - 1)) -split "`t" | Select-Object -First 1
    } else {
        $deviceId = ($usbDevices[0] -split "`t")[0]
    }

    Write-Host "`nEnabling TCP/IP mode on device $deviceId..." -ForegroundColor Cyan
    if ($deviceId) {
        adb -s $deviceId tcpip $Port
    } else {
        adb tcpip $Port
    }

    Write-Host "`nGetting phone's IP address..." -ForegroundColor Cyan
    if ($deviceId) {
        $ipAddress = adb -s $deviceId shell 'ip addr show wlan0 2>/dev/null | grep "inet " | head -1 | awk "{print `$2}" | cut -d/ -f1' 2>$null
    } else {
        $ipAddress = adb shell 'ip addr show wlan0 2>/dev/null | grep "inet " | head -1 | awk "{print `$2}" | cut -d/ -f1' 2>$null
    }

    if (-not $ipAddress -or $ipAddress -match "error") {
        Write-Host "Could not get IP automatically. Please enter it manually:" -ForegroundColor Yellow
        $ipAddress = Read-Host "Enter your phone's IP address"
    } else {
        $ipAddress = $ipAddress.Trim()
        Write-Host "Found IP address: $ipAddress" -ForegroundColor Green
    }

    if ($ipAddress) {
        Write-Host "`nYou can now disconnect the USB cable." -ForegroundColor Yellow
        Write-Host "Connecting wirelessly to $ipAddress`:$Port..." -ForegroundColor Cyan
        adb connect "${ipAddress}:$Port"

        Write-Host "`nChecking connection..." -ForegroundColor Cyan
        adb devices

        $connected = adb devices | Select-String -Pattern "${ipAddress}:$Port.*device"
        if ($connected) {
            Write-Host "`n[OK] Successfully connected wirelessly!" -ForegroundColor Green
            Write-Host "You can now run npm run dev:android to build." -ForegroundColor Green
            Write-Host "`nTo reconnect later, use:" -ForegroundColor Yellow
            Write-Host "  .\scripts\connect-wifi-adb.ps1 $ipAddress" -ForegroundColor White
            exit 0
        }
    }
} else {
    Write-Host "No USB device detected." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "For initial setup, you need to:" -ForegroundColor Yellow
    Write-Host "1. Connect your phone via USB" -ForegroundColor White
    Write-Host "2. Enable USB debugging on your phone" -ForegroundColor White
    Write-Host "3. Run this script again" -ForegroundColor White
    Write-Host ""
    Write-Host "OR use Method 1 (Wireless Debugging) which does not require USB!" -ForegroundColor Green
}

# Method 3: If IP is provided, try to connect directly
if ($PhoneIP -and -not $PairingCode) {
    Write-Host "`n=== Method 3: Direct Connection ===" -ForegroundColor Cyan
    Write-Host "Attempting to connect to $PhoneIP`:$Port..." -ForegroundColor Cyan

    # Remove port if already included
    if ($PhoneIP -match "^(.+):(\d+)$") {
        $connectIP = $PhoneIP
    } else {
        $connectIP = "${PhoneIP}:$Port"
    }

    adb connect $connectIP

    Write-Host "`nChecking connection..." -ForegroundColor Cyan
    adb devices

    $connected = adb devices | Select-String -Pattern "$connectIP.*device"
    if ($connected) {
        Write-Host "`n[OK] Successfully connected!" -ForegroundColor Green
        Write-Host "You can now run npm run dev:android to build." -ForegroundColor Green
        exit 0
    } else {
        Write-Host "`nConnection failed. Make sure:" -ForegroundColor Red
        Write-Host "1. Your phone is on the same Wi-Fi network" -ForegroundColor Yellow
        Write-Host "2. TCP/IP mode is enabled (run adb tcpip 5555 via USB first)" -ForegroundColor Yellow
        Write-Host "3. The IP address is correct" -ForegroundColor Yellow
    }
}

Write-Host "`n=== Setup Instructions ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Option A: Wireless Debugging (No USB needed - Android 11+):" -ForegroundColor Green
Write-Host "  1. On phone: Settings -> Developer options -> Enable Wireless debugging" -ForegroundColor White
Write-Host "  2. Tap Pair device with pairing code" -ForegroundColor White
Write-Host "  3. Run: .\scripts\setup-wireless-adb.ps1 -PhoneIP `"IP:PORT`" -PairingCode `"CODE`"" -ForegroundColor White
Write-Host ""
Write-Host "Option B: Traditional Method (USB required once):" -ForegroundColor Yellow
Write-Host "  1. Connect phone via USB" -ForegroundColor White
Write-Host "  2. Run this script again" -ForegroundColor White
Write-Host ""
Write-Host "Option C: Quick Reconnect (if already set up):" -ForegroundColor Cyan
Write-Host "  .\scripts\connect-wifi-adb.ps1 YOUR_PHONE_IP" -ForegroundColor White
Write-Host ""

