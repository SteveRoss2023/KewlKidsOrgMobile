# Fix PowerShell Profile Issues

If PowerShell won't start due to profile errors, use these methods:

## Method 1: Start PowerShell without profile
```cmd
powershell.exe -NoProfile
```

## Method 2: Disable the profile temporarily
From Command Prompt (cmd.exe):
```cmd
powershell -ExecutionPolicy Bypass -File disable_profile.ps1
```

Then start PowerShell normally. To re-enable:
```cmd
powershell -ExecutionPolicy Bypass -File enable_profile.ps1
```

## Method 3: Edit the profile directly
From Command Prompt:
```cmd
notepad %USERPROFILE%\Documents\WindowsPowerShell\profile.ps1
```

Or navigate to:
`C:\Users\steve_80f2z1j\Documents\WindowsPowerShell\profile.ps1`

## Method 4: Delete and recreate
If all else fails, you can delete the profile:
```cmd
del %USERPROFILE%\Documents\WindowsPowerShell\profile.ps1
```

Then run the setup script again:
```cmd
cd "C:\dev\kewlkids"
powershell -ExecutionPolicy Bypass -File setup_powershell_profile.ps1
```

