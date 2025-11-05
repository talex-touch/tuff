#!/bin/bash

# Tuff App Startup Script for macOS
# This script automatically fixes permissions and launches the app

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_BUNDLE="$SCRIPT_DIR/tuff.app"

# Check if app bundle exists
if [ ! -d "$APP_BUNDLE" ]; then
    echo "Error: tuff.app not found in the same directory as this script."
    echo "Please make sure start.sh and tuff.app are in the same folder."
    exit 1
fi

echo "=== Tuff App Startup Script ==="
echo ""

# Step 1: Remove quarantine attribute
echo "1. Removing quarantine attribute..."
xattr -dr com.apple.quarantine "$APP_BUNDLE" 2>/dev/null || echo "   (Quarantine already removed or not needed)"
echo "   ✓ Done"

# Step 2: Fix main executable permissions
echo "2. Fixing main executable permissions..."
if [ -f "$APP_BUNDLE/Contents/MacOS/tuff" ]; then
    chmod +x "$APP_BUNDLE/Contents/MacOS/tuff"
    echo "   ✓ Fixed"
else
    echo "   ⚠️  Main executable not found"
fi

# Step 3: Fix all Framework executable permissions
echo "3. Fixing Framework executable permissions..."
if [ -d "$APP_BUNDLE/Contents/Frameworks" ]; then
    find "$APP_BUNDLE/Contents/Frameworks" -type f ! -name "*.dylib" ! -name "*.plist" -exec chmod +x {} \; 2>/dev/null
    echo "   ✓ Fixed"
else
    echo "   ⚠️  Frameworks directory not found"
fi

echo ""
echo "=== Launching Tuff App ==="
open "$APP_BUNDLE"

echo ""
echo "✓ App launched! Check your Dock or Application window."
echo ""

