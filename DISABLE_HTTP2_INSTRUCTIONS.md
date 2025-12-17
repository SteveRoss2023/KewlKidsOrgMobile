# Quick Guide: Disable HTTP/2 in Cursor

## Ã¢Å¡Â¡ FASTEST METHOD (I can do this for you)

**Just close Cursor completely, then tell me "go ahead" and I'll add the setting automatically.**

---

## Ã°Å¸â€œÂ MANUAL METHOD (Do it yourself)

### Step 1: Close Cursor
- **Important**: Close Cursor completely (not just the window)
- Right-click Cursor in taskbar Ã¢â€ â€™ Quit
- Or: File Ã¢â€ â€™ Exit

### Step 2: Open Settings File
Press `Win + R`, then type:
```
%APPDATA%\Cursor\User\settings.json
```
Press Enter (opens in Notepad)

### Step 3: Add This Line
Find the opening `{` and add this line (with a comma):
```json
"http.experimental.http2": false,
```

**Your file should look like this:**
```json
{
    "http.experimental.http2": false,
    "window.commandCenter": 1,
    "remote.SSH.remotePlatform": {
        ...
    },
    ...
}
```

### Step 4: Save and Restart
1. Press `Ctrl + S` to save
2. Close the file
3. Open Cursor again

---

## Ã¢Å“â€¦ VERIFY IT WORKED

After restarting, test by asking me a question. If you don't get connection errors, it worked!

---

**Want me to do it? Just close Cursor and say "go ahead".**
