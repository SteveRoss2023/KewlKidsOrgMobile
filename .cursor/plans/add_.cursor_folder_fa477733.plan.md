---
name: Add .cursor folder
overview: Add a project-level `.cursor` directory (with an optional `plans` subfolder) so Cursor-generated or hand-maintained plans have a dedicated location under the repo root.
todos:
  - id: mkdir-cursor-plans
    content: Create `c:\dev\flutter\cc-rydercup\.cursor\plans` (or `.cursor` only if preferred)
    status: completed
  - id: optional-gitkeep
    content: Optionally add `.cursor/plans/.gitkeep` for git-empty-dir tracking
    status: completed
isProject: false
---

# Add `.cursor` for storing plans

## Current state

The workspace root [`c:\dev\flutter\cc-rydercup`](c:\dev\flutter\cc-rydercup) has **no** `.cursor` tree yet (nothing matched `.cursor/**`).

## What to create

1. **Directory**: `.cursor/plans/`
   - Creating `plans` inside `.cursor` creates the parent `.cursor` in one step.
   - Keeps plans separate from other common `.cursor` contents later (e.g. `rules/`, project-specific config).

2. **Optional placeholder** (only if you want the empty folder to be visible in Git later): add `.cursor/plans/.gitkeep` (empty file). Your workspace is not a git repo today, so this is optional; skip it if you prefer zero extra files.

## How to implement (after you approve)

- **PowerShell** (from repo root):

```powershell
New-Item -ItemType Directory -Force -Path "c:\dev\flutter\cc-rydercup\.cursor\plans"
```

- **Optional**: `New-Item -ItemType File -Force -Path "c:\dev\flutter\cc-rydercup\.cursor\plans\.gitkeep"`

## Notes

- Cursor does not require a specific folder name for “plans”; this layout matches the common convention of keeping plan markdown under `.cursor/plans/`.
- If you prefer **only** `.cursor` with no subfolder, use `New-Item ... -Path "c:\dev\flutter\cc-rydercup\.cursor"` instead.
