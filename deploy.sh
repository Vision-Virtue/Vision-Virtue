#!/bin/bash
# Publish Vision & Virtue changes to the live site (visionvirtuepartnership.com)
# Usage:  ./deploy.sh "describe your change"

set -e

cd "$(dirname "$0")"

DEV_BRANCH="claude/vision-virtue-website-qY7BQ"
LIVE_BRANCH="gh-pages"

COMMIT_MSG="$1"
if [ -z "$COMMIT_MSG" ]; then
  echo ""
  echo "ERROR: Please provide a commit message."
  echo "Usage:  ./deploy.sh \"describe your change\""
  echo ""
  exit 1
fi

echo ""
echo "========================================"
echo "  Publishing to live site"
echo "========================================"
echo ""

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Step 1: commit any pending changes on dev branch
if [ "$CURRENT_BRANCH" != "$DEV_BRANCH" ]; then
  echo "Switching to dev branch: $DEV_BRANCH"
  git checkout "$DEV_BRANCH"
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Committing changes on $DEV_BRANCH..."
  git add -A
  git commit -m "$COMMIT_MSG"
else
  echo "No new changes to commit on $DEV_BRANCH."
fi

# Step 2: push dev branch
echo "Pushing $DEV_BRANCH to GitHub..."
git push -u origin "$DEV_BRANCH"

# Step 3: merge into gh-pages and push
echo "Switching to $LIVE_BRANCH..."
git checkout "$LIVE_BRANCH"
git pull origin "$LIVE_BRANCH"

echo "Merging dev changes into live..."
git merge "$DEV_BRANCH" --strategy-option=theirs -m "Deploy: $COMMIT_MSG" || {
  echo ""
  echo "Merge failed. Resolve conflicts manually, then re-run deploy.sh"
  exit 1
}

echo "Pushing live..."
git push -u origin "$LIVE_BRANCH"

# Step 4: return to dev branch
git checkout "$DEV_BRANCH"

echo ""
echo "========================================"
echo "  Deployed to live"
echo "========================================"
echo ""
echo "  Site:    visionvirtuepartnership.com"
echo "  Updates in 1-2 minutes (GitHub Pages build)"
echo ""
echo "  You are back on $DEV_BRANCH — safe to keep editing."
echo ""
