# How to Disable HTTP/2 in Cursor - Step by Step Guide

## Method 1: Using Cursor Settings UI (Recommended)

### Step 1: Open Settings
- **Press**: `Ctrl + ,` (Control + Comma)
- **OR**: Click **File** â†’ **Preferences** â†’ **Settings**
- **OR**: Click the gear icon (âš™ï¸) in the bottom left, then click "Settings"

### Step 2: Search for HTTP/2 Setting
1. In the settings search box at the top, type: **`http2`** or **`HTTP/2`**
2. Look for a setting called:
   - **"Disable HTTP/2"**
   - **"Use HTTP/1.1"**
   - **"HTTP/2 Support"** (then disable it)

### Step 3: Enable the Setting
- **Check the box** next to "Disable HTTP/2" (or uncheck if it says "Enable HTTP/2")
- The setting should show as **enabled/checked**

### Step 4: Restart Cursor
- **Close Cursor completely** (not just the window - fully quit)
- **Reopen Cursor**
- The setting takes effect after restart

---

## Method 2: Edit Settings File Directly (If UI Method Doesn't Work)

### Step 1: Close Cursor
- Make sure Cursor is **completely closed** (not just minimized)

### Step 2: Open Settings File
1. Press `Win + R` to open Run dialog
2. Type: `%APPDATA%\Cursor\User\settings.json`
3. Press Enter
4. The file will open in your default text editor (usually Notepad)

### Step 3: Add the Setting
1. Look for the opening `{` brace
2. Add this line inside the JSON object:
   ```json
   "http.experimental.http2": false,
   ```
   OR
   ```json
   "cursor.http2.disabled": true,
   ```

3. Make sure:
   - There's a comma after the line (unless it's the last item)
   - The JSON is valid (proper brackets, quotes, etc.)

### Example settings.json:
```json
{
    "editor.fontSize": 14,
    "editor.wordWrap": "on",
    "http.experimental.http2": false,
    "cursor.http2.disabled": true
}
```

### Step 4: Save and Restart
1. **Save the file** (`Ctrl + S`)
2. **Close the file**
3. **Open Cursor** - the setting will be applied

---

## Method 3: Using Command Palette

### Step 1: Open Command Palette
- Press `Ctrl + Shift + P`

### Step 2: Search for Settings
1. Type: **`Preferences: Open Settings (JSON)`**
2. Press Enter
3. This opens the settings.json file directly in Cursor

### Step 3: Add the Setting
Add one of these lines:
```json
"http.experimental.http2": false,
```
OR
```json
"cursor.http2.disabled": true,
```

### Step 4: Save and Restart
1. Save (`Ctrl + S`)
2. Restart Cursor

---

## Verify the Setting Worked

After restarting Cursor:

1. **Test a simple AI request** - ask me something simple
2. **Monitor for connection errors** - see if you still get the "Connection Error" dialog
3. **Check settings again** - verify the setting is still enabled

---

## Troubleshooting

### "I can't find the HTTP/2 setting"
- The setting name might vary by Cursor version
- Try searching for: `http`, `network`, `protocol`, `connection`
- Check Cursor's documentation for your version

### "The setting doesn't exist"
- Your Cursor version might not expose this setting
- Try Method 2 (edit settings.json directly)
- Update Cursor to the latest version

### "Settings file won't save"
- Make sure Cursor is **completely closed**
- Check file permissions
- Try running your text editor as Administrator

### "Still getting connection errors"
- Make sure you **restarted Cursor** (not just reloaded window)
- Check Windows Firewall (allow Cursor)
- Try disabling antivirus temporarily
- Check the other fixes in `CURSOR_CONNECTION_ROOT_CAUSE.md`

---

## Quick Reference

**Setting Location**: `%APPDATA%\Cursor\User\settings.json`

**Setting to Add**:
```json
"http.experimental.http2": false,
```

**After Changing**: **Restart Cursor completely**

---

Need help? Check `Docs/CURSOR_CONNECTION_ROOT_CAUSE.md` for more troubleshooting steps.

