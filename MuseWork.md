# MuseWork.md

Work log for Muse (Bruce's AI agent). Read this when working in this repo.

## What Muse did (2026-10-08)

- Deleted all six GitHub Actions workflows from `main` (6 commits, all titled "Remove deprecated Actions workflows", ~19:39–19:40 UTC).
- Repo is **deprecated** — no further development is planned.

## Current state / thoughts

- Dead repo. The workflow deletions were cleanup so nothing keeps running (CI minutes, scheduled jobs) on a deprecated project.
- Last real feature work was July 2026 (Shoffi affiliate attribution, GDPR webhooks).

## Suggestions for the Claude agent

- Don't build anything here unless Bruce explicitly revives the repo.
- If it is ever revived: `.github/workflows/` is now empty, so CI/CD would need recreating from scratch. Check `shopify.app.toml` and env requirements (e.g. `SHOFFI_API_KEY`) before assuming anything still deploys.
- Consider archiving the repo on GitHub (Settings → Archive) to make the deprecated status official — ask Bruce first.
