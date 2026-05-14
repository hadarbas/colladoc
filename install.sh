#!/bin/bash
# CollaDoc install — sets up the server as a macOS LaunchAgent.
# Usage: bash install.sh [folder-to-serve] [port]
# Defaults: current directory, port 3000

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVE_DIR="${1:-$HOME}"
PORT="${2:-3000}"
NODE_BIN="$(which node)"
PLIST="$HOME/Library/LaunchAgents/com.colladoc.server.plist"
LOG_DIR="$HOME/Library/Logs/colladoc"

mkdir -p "$LOG_DIR"

cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.colladoc.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$SCRIPT_DIR/colladoc-server.js</string>
    <string>$SERVE_DIR</string>
    <string>$PORT</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/server.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/error.log</string>
</dict>
</plist>
EOF

# Load or reload
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "CollaDoc server installed and running."
echo "  Serving: $SERVE_DIR"
echo "  Port:    $PORT"
echo "  Logs:    $LOG_DIR"
echo ""
echo "To uninstall: launchctl unload $PLIST && rm $PLIST"
echo ""
echo "To install on another machine:"
echo "  bash install.sh \"/path/to/your/folder\" $PORT"
