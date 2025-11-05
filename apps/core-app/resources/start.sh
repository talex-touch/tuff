#!/bin/bash

# Tuff App Startup Script for macOS
# This script automatically fixes permissions and launches the app

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_BUNDLE="$SCRIPT_DIR/tuff.app"

# Check if app bundle exists
if [ ! -d "$APP_BUNDLE" ]; then
    echo "Error: tuff.app not found in the same directory as this script."
    echo "Please make sure start.sh and tuff.app are in the same folder."
    echo "Current directory: $SCRIPT_DIR"
    echo "Contents:"
    ls -la "$SCRIPT_DIR" | grep -E "(tuff\.app|start\.sh)"
    exit 1
fi

echo "=== Tuff App Startup Script ==="
echo ""

# Step 1: Remove ALL extended attributes (more thorough than just quarantine)
echo "1. Removing all extended attributes..."
xattr -cr "$APP_BUNDLE" 2>/dev/null || true
echo "   ✓ Removed all extended attributes"

# Step 2: Fix main executable permissions
echo "2. Fixing main executable permissions..."
if [ -f "$APP_BUNDLE/Contents/MacOS/tuff" ]; then
    chmod +x "$APP_BUNDLE/Contents/MacOS/tuff"
    echo "   ✓ Fixed"
else
    echo "   ⚠️  Main executable not found at $APP_BUNDLE/Contents/MacOS/tuff"
    exit 1
fi

# Step 3: Fix all Framework executable permissions
echo "3. Fixing Framework executable permissions..."
if [ -d "$APP_BUNDLE/Contents/Frameworks" ]; then
    find "$APP_BUNDLE/Contents/Frameworks" -type f ! -name "*.dylib" ! -name "*.plist" -exec chmod +x {} \; 2>/dev/null || true
    echo "   ✓ Fixed"
else
    echo "   ⚠️  Frameworks directory not found"
fi

# Step 4: Add ad-hoc code signature (if not already signed)
echo "4. Adding ad-hoc code signature..."
if ! codesign --verify --verbose "$APP_BUNDLE" > /dev/null 2>&1; then
    if codesign --force --deep --sign - "$APP_BUNDLE" > /dev/null 2>&1; then
        echo "   ✓ Added ad-hoc signature"
    else
        echo "   ⚠️  Could not add signature (may need to run manually)"
    fi
else
    echo "   ✓ App already has signature"
fi

# Step 5: Clear Gatekeeper cache
echo "5. Clearing Gatekeeper cache..."
# Clear user-level cache
if [ -d "$HOME/Library/Caches/com.apple.quarantine" ]; then
    rm -rf "$HOME/Library/Caches/com.apple.quarantine"/* 2>/dev/null || true
    echo "   ✓ Cleared user-level cache"
fi

# Try to clear system cache (may need sudo, but won't fail if denied)
sudo rm -rf /private/var/db/SystemPolicyConfiguration/AssessmentCache 2>/dev/null || true
sudo rm -rf /private/var/folders/*/*/C/com.apple.quarantine 2>/dev/null || true

echo ""
echo "=== Launching Tuff App ==="
echo ""

# Method 1: Try using osascript to bypass Gatekeeper UI check
echo "Attempting to launch app (bypassing Gatekeeper UI)..."
osascript <<EOF 2>/dev/null || true
tell application "Finder"
    set appPath to POSIX file "$APP_BUNDLE"
    open appPath
end tell
EOF

# Wait a moment to see if app launched
sleep 2

# Check if app is running
if pgrep -f "tuff.app" > /dev/null 2>&1; then
    echo "✓ App launched successfully!"
    echo ""
    exit 0
fi

# Method 2: Try direct executable launch (bypasses Gatekeeper)
echo "Trying direct executable launch..."
"$APP_BUNDLE/Contents/MacOS/tuff" > /dev/null 2>&1 &
EXEC_PID=$!
sleep 2

if ps -p $EXEC_PID > /dev/null 2>&1; then
    echo "✓ App launched successfully via direct executable!"
    echo ""
    exit 0
fi

# Method 3: Try standard open command
echo "Trying standard open command..."
if open "$APP_BUNDLE" 2>/dev/null; then
    sleep 2
    if pgrep -f "tuff.app" > /dev/null 2>&1; then
        echo "✓ App launched successfully!"
        echo ""
        exit 0
    fi
fi

# If all methods failed, provide manual instructions
echo ""
echo "⚠️  Automatic launch failed. Please use one of these methods:"
echo ""
echo "Method 1: Right-click and Open (RECOMMENDED)"
echo "  1. In Finder, navigate to: $SCRIPT_DIR"
echo "  2. Right-click on 'tuff.app'"
echo "  3. Select 'Open' from the context menu"
echo "  4. Click 'Open' in the security dialog"
echo ""
echo "Method 2: Terminal command"
echo "  cd \"$SCRIPT_DIR\""
echo "  open -a \"$APP_BUNDLE\""
echo ""
echo "Method 3: Direct executable"
echo "  \"$APP_BUNDLE/Contents/MacOS/tuff\""
echo ""
echo "Note: The 'damaged' error is a macOS Gatekeeper security feature."
echo "The app is NOT actually damaged - it's just unsigned."
echo "Right-clicking and selecting 'Open' will bypass this check."
echo ""

