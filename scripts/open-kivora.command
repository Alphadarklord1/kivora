#!/bin/bash
# Kivora launcher — removes macOS quarantine and opens the app.
# Students double-click this file from the DMG window.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_IN_DMG="$SCRIPT_DIR/Kivora.app"
APP_IN_APPS="/Applications/Kivora.app"

# Try to clear quarantine on the app inside the DMG first
if [ -d "$APP_IN_DMG" ]; then
  xattr -cr "$APP_IN_DMG" 2>/dev/null || true
fi

# If already installed in Applications, clear there too
if [ -d "$APP_IN_APPS" ]; then
  xattr -cr "$APP_IN_APPS" 2>/dev/null || true
  open "$APP_IN_APPS"
  exit 0
fi

# Not installed yet — ask to copy to Applications
osascript -e 'display dialog "Drag Kivora.app to the Applications folder in this window, then run this script again to open it." buttons {"OK"} default button "OK" with title "Kivora" with icon note' 2>/dev/null || true
