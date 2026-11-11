# Copilot instructions — SYSS Physics Practice

Follow `AGENTS.md` at the repository root. The essentials:

- Public repo: never add question data, answer keys, solutions or any credentials. Tests use `tests/fixtures/` (synthetic).
- Vanilla ES modules, no build step. Firebase JS SDK 13 from gstatic; Cloud Functions v2 in `functions/index.js`.
- Marking and anything involving answer keys happens only in Cloud Functions; `canReveal()` decides what students may see.
- Change `firestore.rules` and `tests/fakes/rules.mjs` together. Add new callables to `api` in `js/fb.js`.
- Student-facing callables call `rateLimit(user, bucket)`.
- After changing `js/` or `css/`, run `python3 tools/bump_version.py`.
- Every change: add/extend a section in `tests/run.mjs`, run `cd tests && npm install && node run.mjs` (must pass with no
  console errors), update `README.md`, and say whether a Firebase deploy (`deploy.command`) is needed.
