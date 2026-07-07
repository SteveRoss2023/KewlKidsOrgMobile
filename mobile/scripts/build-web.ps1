# Production Expo web build + PWA cache-bust patches (BootyCup-style).
$ErrorActionPreference = "Stop"
$mobile = Split-Path $PSScriptRoot -Parent
$dist = Join-Path $mobile "dist"
$stamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
$cacheBust = Get-Date -Format "yyyyMMddHHmmss"

Push-Location $mobile
try {
  npx expo export --platform web
  if ($LASTEXITCODE -ne 0) {
    throw "expo export --platform web failed with exit code $LASTEXITCODE"
  }
  if (-not (Test-Path $dist)) {
    throw "Build output missing: $dist"
  }

  $versionJson = @{ built = $stamp; app = "kewlkids-organizer" } | ConvertTo-Json -Compress
  Set-Content -Path (Join-Path $dist "version.json") -Value $versionJson -Encoding utf8

  $indexPath = Join-Path $dist "index.html"
  if (Test-Path $indexPath) {
    $html = Get-Content $indexPath -Raw
    $html = $html -replace 'href="/manifest\.json"', "href=`"/manifest.json?v=$cacheBust`""
    $html = $html -replace 'href="/icons/Icon-192\.png"', "href=`"/icons/Icon-192.png?v=$cacheBust`""
    $html = $html -replace 'href="favicon\.png"', "href=`"favicon.png?v=$cacheBust`""
    Set-Content -Path $indexPath -Value $html -Encoding utf8 -NoNewline
    Write-Host "Patched index.html (cache-bust v=$cacheBust)" -ForegroundColor Cyan
  }

  $manifestPath = Join-Path $dist "manifest.json"
  if (Test-Path $manifestPath) {
    $manifest = Get-Content $manifestPath -Raw
    $manifest = $manifest -replace '"src":\s*"icons/([^"]+)"', "`"src`": `"icons/`$1?v=$cacheBust`""
    if ($manifest -notmatch '"id"\s*:') {
      $manifest = $manifest -replace '^\{', "{`n  `"id`": `"/`","
    }
    Set-Content -Path $manifestPath -Value $manifest -Encoding utf8 -NoNewline
    Write-Host "Patched manifest.json icon URLs (v=$cacheBust)" -ForegroundColor Cyan
  }

  Write-Host "OK: $dist" -ForegroundColor Green
  Write-Host "Built: $stamp" -ForegroundColor Green
  Write-Host "PWA on phone: REMOVE old home-screen shortcut, then Add to Home Screen again after icon changes." -ForegroundColor Yellow
} finally {
  Pop-Location
}
