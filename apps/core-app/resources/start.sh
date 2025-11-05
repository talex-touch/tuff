#!/bin/bash

# Tuff App Startup Script for macOS
# This script automatically fixes permissions and launches the app

# Remove set -e to avoid immediate exit on errors
# set -e

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

# Step 1: Remove quarantine attribute (including all extended attributes)
echo "1. Removing quarantine attribute..."
if xattr -dr com.apple.quarantine "$APP_BUNDLE" 2>/dev/null; then
    echo "   ✓ Removed quarantine attribute"
else
    echo "   ✓ Quarantine already removed or not needed"
fi

# Also remove any other quarantine-related attributes
xattr -c "$APP_BUNDLE" 2>/dev/null || true

# Step 2: Clear Gatekeeper assessment cache
echo "2. Clearing Gatekeeper assessment cache..."
if sudo spctl --assess --verbose --force "$APP_BUNDLE" 2>/dev/null; then
    echo "   ✓ Cleared assessment cache"
else
    echo "   ⚠️  Could not clear assessment cache (may need sudo)"
    echo "   → You can manually run: sudo spctl --assess --force \"$APP_BUNDLE\""
fi

# Alternative: Clear Gatekeeper cache without sudo (if possible)
# This clears the user-level cache
if [ -d "$HOME/Library/Caches/com.apple.quarantine" ]; then
    echo "   → Clearing user-level quarantine cache..."
    rm -rf "$HOME/Library/Caches/com.apple.quarantine"/* 2>/dev/null || true
fi

# Step 3: Fix main executable permissions
echo "3. Fixing main executable permissions..."
if [ -f "$APP_BUNDLE/Contents/MacOS/tuff" ]; then
    chmod +x "$APP_BUNDLE/Contents/MacOS/tuff"
    echo "   ✓ Fixed"
else
    echo "   ⚠️  Main executable not found at $APP_BUNDLE/Contents/MacOS/tuff"
fi

# Step 4: Fix all Framework executable permissions
echo "4. Fixing Framework executable permissions..."
if [ -d "$APP_BUNDLE/Contents/Frameworks" ]; then
    if find "$APP_BUNDLE/Contents/Frameworks" -type f ! -name "*.dylib" ! -name "*.plist" -exec chmod +x {} \; 2>/dev/null; then
        echo "   ✓ Fixed"
    else
        echo "   ⚠️  Some permissions may have failed"
    fi
else
    echo "   ⚠️  Frameworks directory not found"
fi

echo ""
echo "=== Launching Tuff App ==="

# Try to open the app
if open "$APP_BUNDLE" 2>/dev/null; then
    echo ""
    echo "✓ App launch command sent!"
    echo ""
    echo "If you still see 'damaged' error dialog:"
    echo "  1. Right-click on tuff.app"
    echo "  2. Select 'Open' from the context menu"
    echo "  3. Click 'Open' in the security dialog"
    echo ""
else
    echo ""
    echo "⚠️  Failed to launch app using 'open' command."
    echo ""
    echo "Please try one of these methods:"
    echo ""
    echo "Method 1: Right-click and Open"
    echo "  1. Right-click on tuff.app"
    echo "  2. Select 'Open' from the context menu"
    echo "  3. Click 'Open' in the security dialog"
    echo ""
    echo "Method 2: Terminal command"
    echo "  cd \"$SCRIPT_DIR\""
    echo "  open -a \"$APP_BUNDLE\""
    echo ""
    echo "Method 3: Direct executable (if above don't work)"
    echo "  \"$APP_BUNDLE/Contents/MacOS/tuff\""
    echo ""
fi

