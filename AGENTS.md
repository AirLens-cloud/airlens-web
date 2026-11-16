# Agent instructions

Build, lint and test commands are listed in [README.md → Develop](README.md#develop). Use Node 22, the version CI uses.

Before opening a pull request, run the checks in `.github/workflows/ci.yml`:

- Repository root: `npm ci`, then `npm run typecheck`, `npm run lint`, `npm run lint:design` (compares against `origin/main`), `npm run test:run` and `npm run build`.
- `workers/api` and `workers/public-api` (each has its own lockfile), inside each folder: `npm ci`, `npm run type-check`, `npm test`.

Run `npm run setup-hooks` once per clone. The pre-commit hook scans staged changes with gitleaks (`gitleaks.toml`) and refuses the commit when gitleaks is not installed.
