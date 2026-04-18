#!/bin/bash
# Start the marketing-backend locally for backend development
# Backend runs at http://localhost:3000
# Render backend (live) is NOT affected

set -e

cd "$(dirname "$0")/marketing-backend"

echo ""
echo "========================================"
echo "  Vision & Virtue — Backend Dev Server"
echo "========================================"
echo ""

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies (first run)..."
  npm install
fi

if [ ! -f ".env" ]; then
  echo ""
  echo "WARNING: No .env file found in marketing-backend/"
  echo "Copy .env.example to .env and fill in values before running."
  echo ""
  exit 1
fi

echo "  Backend:   http://localhost:3000"
echo "  Live API:  NOT affected"
echo ""
echo "  TIP: To point your local frontend at this backend,"
echo "       temporarily set BACKEND in marketing.js to http://localhost:3000"
echo "       Remember to change it back before running ./deploy.sh"
echo ""
echo "  Press Ctrl+C to stop."
echo ""
echo "========================================"
echo ""

npm run dev
