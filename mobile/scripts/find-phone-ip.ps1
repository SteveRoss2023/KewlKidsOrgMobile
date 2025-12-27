# Script to help find your phone's IP address
# This will scan your local network for Android devices

Write-Host "`n=== Finding Phone IP Address ===" -ForegroundColor Cyan
Write-Host ""

# Get local network IP range
$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like "10.*" -or $_.IPAddress -like "192.168.*" -or $_.IPAddress -like "172.*" } | Select-Object -First 1).IPAddress

if (-not $localIP) {
    Write-Host "Could not detect local network. Please enter your computer's IP address:" -ForegroundColor Yellow
    $localIP = Read-Host "Enter IP (e.g., 10.0.0.25)"
}

Write-Host "Your computer's IP: $localIP" -ForegroundColor Green
Write-Host ""

# Extract network prefix
if ($localIP -match "^(\d+\.\d+\.\d+)\.\d+$") {
    $networkPrefix = $matches[1]
    Write-Host "Scanning network $networkPrefix.0/24 for Android devices..." -ForegroundColor Cyan
    Write-Host "This may take a minute..." -ForegroundColor Yellow
    Write-Host ""

    $foundDevices = @()
    $jobs = @()

    # Scan common IP range
    for ($i = 1; $i -le 254; $i++) {
        $ip = "$networkPrefix.$i"
        $job = Start-Job -ScriptBlock {
            param($targetIP)
            $result = Test-Connection -ComputerName $targetIP -Count 1 -Quiet -ErrorAction SilentlyContinue
            if ($result) {
                # Try to connect via ADB
                $adbResult = adb connect "$targetIP`:5555" 2>&1
                if ($adbResult -match "connected" -or $adbResult -match "already connected") {
                    return $targetIP
                }
            }
            return $null
        } -ArgumentList $ip
        $jobs += $job
    }

    # Wait for jobs and collect results
    $jobs | Wait-Job | Out-Null
    $results = $jobs | Receive-Job
    $jobs | Remove-Job

    $foundIPs = $results | Where-Object { $_ -ne $null }

    if ($foundIPs) {
        Write-Host "[OK] Found Android device(s):" -ForegroundColor Green
        $foundIPs | ForEach-Object { Write-Host "  $_:5555" -ForegroundColor Green }
        Write-Host ""
        Write-Host "To connect, run:" -ForegroundColor Cyan
        $foundIPs | ForEach-Object { Write-Host "  .\scripts\connect-wifi-adb.ps1 $_" -ForegroundColor White }
    } else {
        Write-Host "[WARNING] No Android devices found on network." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Manual steps to find IP:" -ForegroundColor Cyan
        Write-Host "1. On your phone: Settings -> Wi-Fi" -ForegroundColor White
        Write-Host "2. Tap on your connected Wi-Fi network" -ForegroundColor White
        Write-Host "3. Look for IP address (usually shown at the bottom)" -ForegroundColor White
        Write-Host ""
        Write-Host "Or check your router's connected devices list." -ForegroundColor Yellow
    }
} else {
    Write-Host "Could not determine network prefix from IP: $localIP" -ForegroundColor Red
    Write-Host ""
    Write-Host "Manual steps to find IP:" -ForegroundColor Cyan
    Write-Host "1. On your phone: Settings -> Wi-Fi" -ForegroundColor White
    Write-Host "2. Tap on your connected Wi-Fi network" -ForegroundColor White
    Write-Host "3. Look for IP address" -ForegroundColor White
}

Write-Host ""



