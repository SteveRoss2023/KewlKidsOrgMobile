# Quick script to reconnect to phone via WiFi ADB
# Usage: .\scripts\connect-wifi-adb.ps1 [YOUR_PHONE_IP]
# Example: .\scripts\connect-wifi-adb.ps1 192.168.1.100
# If no IP provided, will check for existing wireless connections

param(
    [Parameter(Mandatory = $false)]
    [string]$PhoneIP
)

Write-Host "`n=== Wireless ADB Reconnect ===" -ForegroundColor Cyan
Write-Host ""

# Check if already connected
$devices = adb devices | Select-Object -Skip 1 | Where-Object { $_ -match "device" }
$wirelessDevices = $devices | Where-Object { $_ -match ":" }

if ($wirelessDevices -and -not $PhoneIP) {
    Write-Host "[OK] Already connected wirelessly:" -ForegroundColor Green
    $wirelessDevices | ForEach-Object { Write-Host "  $_" -ForegroundColor Green }
    Write-Host "`nYou're all set! Run npm run dev:android to build." -ForegroundColor Green
    exit 0
}

if (-not $PhoneIP) {
    Write-Host "No IP address provided and no wireless connection found." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Cyan
    Write-Host "  .\scripts\connect-wifi-adb.ps1 YOUR_PHONE_IP" -ForegroundColor White
    Write-Host ""
    Write-Host "Example:" -ForegroundColor Cyan
    Write-Host "  .\scripts\connect-wifi-adb.ps1 10.0.0.146" -ForegroundColor White
    Write-Host ""
    Write-Host "To find your phone's IP:" -ForegroundColor Yellow
    Write-Host "  Settings -> Wi-Fi -> Tap your network -> View IP address" -ForegroundColor White
    Write-Host ""
    Write-Host "For initial setup, use:" -ForegroundColor Yellow
    Write-Host "  .\scripts\setup-wireless-adb.ps1" -ForegroundColor White
    exit 1
}

# Remove port if included
if ($PhoneIP -match "^(.+):(\d+)$") {
    $ip = $matches[1]
    $port = $matches[2]
}
else {
    $ip = $PhoneIP
    $port = 5555
}

Write-Host "Connecting to phone at ${ip}:${port}..." -ForegroundColor Cyan

$result = adb connect "${ip}:${port}" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nChecking connection..." -ForegroundColor Cyan
    adb devices

    $connected = adb devices | Select-String -Pattern "${ip}:${port}.*device"
    if ($connected) {
        Write-Host "`n[OK] Successfully connected!" -ForegroundColor Green
        Write-Host "You can now run npm run dev:android to build and install." -ForegroundColor Green
    }
    else {
        Write-Host "`n[WARNING] Connection attempted but device not showing as device status." -ForegroundColor Yellow
        Write-Host "The device may be unauthorized. Check your phone for a USB debugging prompt." -ForegroundColor Yellow
    }
}
else {
    Write-Host "`n[ERROR] Connection failed!" -ForegroundColor Red
    Write-Host $result -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Make sure your phone is on the same Wi-Fi network" -ForegroundColor White
    Write-Host "2. Verify the IP address is correct (Settings -> Wi-Fi -> Your network)" -ForegroundColor White
    Write-Host "3. If this is the first time, you may need to enable TCP/IP mode via USB:" -ForegroundColor White
    Write-Host "   - Connect via USB" -ForegroundColor White
    Write-Host "   - Run: adb tcpip 5555" -ForegroundColor White
    Write-Host "   - Then disconnect USB and try again" -ForegroundColor White
    Write-Host ""
    Write-Host "For Android 11+ wireless debugging (no USB needed):" -ForegroundColor Green
    Write-Host "  .\scripts\setup-wireless-adb.ps1" -ForegroundColor White
}

