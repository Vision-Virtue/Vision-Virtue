#!/bin/bash
# Start local dev server for Vision & Virtue website
# Frontend runs at http://localhost:8000 — calls the live Render backend
# This does NOT affect visionvirtuepartnership.com

set -e

cd "$(dirname "$0")"

echo ""
echo "========================================"
echo "  Vision & Virtue — Local Dev Server"
echo "========================================"
echo ""
echo "  Frontend:  http://localhost:8000"
echo "  Backend:   live on Render (unchanged)"
echo ""
echo "  Live site: visionvirtuepartnership.com"
echo "  Status:    NOT affected while you develop"
echo ""
echo "  Edit any .html / .css / .js file — refresh browser to see changes."
echo "  Press Ctrl+C to stop the server."
echo ""
echo "========================================"
echo ""

if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server 8000
elif command -v python >/dev/null 2>&1; then
  python -m http.server 8000
elif command -v npx >/dev/null 2>&1; then
  npx serve . -l 8000
else
  echo "ERROR: Neither python3 nor npx is installed."
  echo "Install Python from https://python.org or Node.js from https://nodejs.org"
  exit 1
fi
