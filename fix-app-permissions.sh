#!/bin/bash

# Script to fix permissions and remove quarantine from tuff.app
# This is needed for unsigned macOS apps due to Gatekeeper

APP_PATH="$1"

if [ -z "$APP_PATH" ]; then
    # Try to find the app automatically
    if [ -d "$HOME/Downloads/tuff.app" ]; then
        APP_PATH="$HOME/Downloads/tuff.app"
    elif [ -d "$HOME/Downloads/macos-latest-release-tuff.app" ]; then
        APP_PATH="$HOME/Downloads/macos-latest-release-tuff.app"
    else
        echo "Usage: $0 <path-to-app.app>"
        echo "Example: $0 ~/Downloads/tuff.app"
        exit 1
    fi
fi

if [ ! -d "$APP_PATH" ]; then
    echo "Error: App not found at $APP_PATH"
    exit 1
fi

echo "Fixing permissions for: $APP_PATH"
echo ""

# Fix executable permissions
EXECUTABLE="$APP_PATH/Contents/MacOS/tuff"
if [ -f "$EXECUTABLE" ]; then
    echo "Setting execute permissions..."
    chmod +x "$EXECUTABLE"
    echo "✓ Execute permissions set"
else
    echo "Warning: Executable not found at $EXECUTABLE"
fi

# Remove quarantine attribute (macOS Gatekeeper)
echo "Removing quarantine attribute..."
xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✓ Quarantine attribute removed"
else
    echo "Warning: Could not remove quarantine attribute"
    echo "You may need to run manually: xattr -dr com.apple.quarantine \"$APP_PATH\""
fi

echo ""
echo "Done! You can now try to open the app."
echo ""
echo "If you still see 'damaged' error, try:"
echo "  sudo spctl --master-disable  # Disable Gatekeeper (not recommended)"
echo "  or right-click the app and select 'Open' instead of double-click"

