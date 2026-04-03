#!/bin/bash
# Kivora launcher — removes macOS quarantine and opens the app.
# ───────────────────────────────────────────────────────────────
# Students double-click this file from the DMG window.
# This bypasses the "unidentified developer" Gatekeeper warning
# without needing to change any System Settings.
# ───────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="Kivora.app"
APP_IN_DMG="$SCRIPT_DIR/$APP_NAME"
APP_IN_APPS="/Applications/$APP_NAME"

# ── Helper: show a macOS dialog ──────────────────────────────────
dialog() {
  local msg="$1"
  local title="${2:-Kivora}"
  osascript -e "display dialog \"$msg\" buttons {\"OK\"} default button \"OK\" with title \"$title\" with icon note" 2>/dev/null || true
}

# ── 1. Clear quarantine from both locations ──────────────────────
for target in "$APP_IN_DMG" "$APP_IN_APPS"; do
  if [ -d "$target" ]; then
    xattr -cr "$target" 2>/dev/null || true
  fi
done

# ── 2. If already installed in /Applications, open it directly ──
if [ -d "$APP_IN_APPS" ]; then
  open "$APP_IN_APPS"
  exit 0
fi

# ── 3. App is in DMG but not in Applications ─────────────────────
if [ ! -d "$APP_IN_DMG" ]; then
  dialog "Kivora.app was not found. Please re-download the DMG from the Kivora website."
  exit 1
fi

# ── 4. Copy to Applications and launch ──────────────────────────
echo "[Kivora] Copying to /Applications…"
cp -R "$APP_IN_DMG" /Applications/ 2>/dev/null

if [ $? -ne 0 ]; then
  # Copy failed — try with admin password via osascript
  osascript -e "do shell script \"cp -R '$APP_IN_DMG' /Applications/\" with administrator privileges" 2>/dev/null || {
    dialog "Could not copy Kivora to Applications. Please drag Kivora.app into the Applications folder manually, then run this script again."
    exit 1
  }
fi

# Clear quarantine on the installed copy
xattr -cr "$APP_IN_APPS" 2>/dev/null || true

echo "[Kivora] Launching…"
open "$APP_IN_APPS"
