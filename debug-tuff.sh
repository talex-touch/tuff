#!/bin/bash

# Debug script to run tuff.app and capture output

# Try to find tuff.app
if [ -d "$HOME/Downloads/tuff.app" ]; then
    APP_PATH="$HOME/Downloads/tuff.app/Contents/MacOS/tuff"
elif [ -d "$HOME/Downloads/macos-latest-release-tuff.app" ]; then
    APP_PATH="$HOME/Downloads/macos-latest-release-tuff.app/Contents/MacOS/tuff"
elif [ -f "$HOME/Downloads/macos-latest-release-tuff.app.zip" ]; then
    echo "Found zip file, extracting..."
    cd "$HOME/Downloads"
    unzip -q -o macos-latest-release-tuff.app.zip
    APP_PATH="$HOME/Downloads/macos-latest-release-tuff.app/Contents/MacOS/tuff"
else
    echo "Error: tuff.app not found in Downloads!"
    echo "Please check if the app is extracted or available."
    exit 1
fi

LOG_FILE="/tmp/tuff-debug.log"

echo "Starting tuff.app..."
echo "App path: $APP_PATH"
echo "Log file: $LOG_FILE"
echo ""

# Check if executable exists
if [ ! -f "$APP_PATH" ]; then
    echo "Error: Executable not found at $APP_PATH"
    echo "Checking app structure..."
    APP_DIR=$(dirname "$APP_PATH")
    if [ -d "$APP_DIR" ]; then
        echo "MacOS directory contents:"
        ls -la "$APP_DIR"
    else
        echo "MacOS directory does not exist!"
    fi
    exit 1
fi

# Run the app and capture all output
"$APP_PATH" 2>&1 | tee "$LOG_FILE" &

# Wait a bit for the app to start
sleep 5

# Show the log
echo ""
echo "=== Application Output ==="
cat "$LOG_FILE"

echo ""
echo "=== Checking for log files ==="
if [ -f "$HOME/Library/Application Support/com.tagzxia.app.tuff/tuff/logs/D.$(date +%Y-%m-%d).log" ]; then
    echo "Found log file:"
    tail -50 "$HOME/Library/Application Support/com.tagzxia.app.tuff/tuff/logs/D.$(date +%Y-%m-%d).log"
fi

if [ -f "$HOME/Library/Application Support/com.tagzxia.app.tuff/tuff/logs/E.$(date +%Y-%m-%d).err" ]; then
    echo "Found error log file:"
    tail -50 "$HOME/Library/Application Support/com.tagzxia.app.tuff/tuff/logs/E.$(date +%Y-%m-%d).err"
fi

