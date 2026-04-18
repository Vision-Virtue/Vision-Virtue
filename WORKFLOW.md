# Vision & Virtue — Development Workflow

Simple workflow for editing the site without breaking the live version.

## Quick Reference

| Task | Command |
|------|---------|
| Start local frontend (view/edit site) | `./dev.sh` |
| Start local backend (only if editing backend) | `./backend-dev.sh` |
| Publish changes to live site | `./deploy.sh "describe your change"` |

## First-Time Setup

Make the scripts executable (one-time only):

```bash
chmod +x dev.sh deploy.sh backend-dev.sh
```

## Daily Workflow

### 1. Start your dev server

```bash
./dev.sh
```

Opens at **http://localhost:8000** — edit any file, refresh browser to see changes. The live site `visionvirtuepartnership.com` is **NOT affected**.

### 2. Edit files in VS Code

Open the project folder in VS Code. Edit `index.html`, `styles.css`, `marketing.js`, etc. Save files and refresh the browser to see changes locally.

### 3. (Optional) Modify backend

If you need to change backend code (`marketing-backend/`), open a second terminal and run:

```bash
./backend-dev.sh
```

Then in `marketing.js`, temporarily change `BACKEND` from the Render URL to `http://localhost:3000`. **Remember to change it back before deploying.**

### 4. Publish to live

When your changes are tested and ready:

```bash
./deploy.sh "added new hero section"
```

The script will:
1. Commit your changes on the dev branch
2. Push dev branch to GitHub
3. Merge into the `gh-pages` (live) branch
4. Push live
5. Return you to the dev branch

Live site updates within 1–2 minutes.

## Golden Rules

- **Never edit directly on `gh-pages`.** Always edit on `claude/vision-virtue-website-qY7BQ`.
- **Always test locally first** using `./dev.sh` before running `./deploy.sh`.
- **If you change `BACKEND` in `marketing.js` for testing, change it back** before deploying.

## Troubleshooting

**`./dev.sh: command not found`** — Run `chmod +x dev.sh deploy.sh backend-dev.sh` first.

**Port 8000 already in use** — Another server is running. Stop it or edit `dev.sh` to use a different port.

**Merge conflict during `./deploy.sh`** — Resolve in VS Code, then run `git add -A && git commit -m "fix conflict" && git push origin gh-pages && git checkout claude/vision-virtue-website-qY7BQ`.
