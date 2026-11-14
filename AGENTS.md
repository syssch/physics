# AGENTS.md — SYSS Physics Practice (syssch.github.io/physics)

Instructions for AI coding agents (Codex, Cursor, Copilot, Claude Code, Gemini CLI…) working in this repository.
This repo is the **public website + server code** of a multiple-choice practice platform for Sing Yin Secondary School
Physics. Question data and answer keys are **not** here (they are imported into Firestore by a teacher) — keep it that way.
Read `README.md` for the full feature description.

## Rules

- **Never commit question data, answer keys or solutions** (`bundle.json`, `platform_prep/export/`, real question text).
  Tests use the synthetic data in `tests/fixtures/` only.
- **No credentials.** Never add service-account keys, tokens or passwords; never try to deploy. The maintainer reviews
  changes, pushes with GitHub Desktop and deploys Firebase with `deploy.command`.
- **Marking happens only in Cloud Functions.** Students must never receive answer keys/solutions before the assignment's
  reveal rule allows (`canReveal()` in `functions/index.js` is the single source of truth).
- `firestore.rules` and its JS mirror `tests/fakes/rules.mjs` must always change **together**.
- After any change in `js/` or `css/`: run `python3 tools/bump_version.py` (adds `?v=` cache busting to imports).
- Finish every change with: tests passing with no console errors, the **handoff update** below, and a note saying
  whether the maintainer only needs to push (site files) or also run `deploy.command` (functions / rules / indexes).

## Stack

- Static site on GitHub Pages: `index.html`, `css/`, `js/` — vanilla ES modules, **no build step, no bundler**.
  Firebase JS SDK 13 from gstatic, DOMPurify (`js/vendor/`), MathJax 3, Tabler icons webfont **3.51.0** (check an icon
  exists in that version before using it).
- Firebase project `singyin-physics`: Google sign-in limited to `@syss.edu.hk` (students) and `@singyin.edu.hk`
  (staff); Firestore; Storage (figures); Cloud Functions v2 in `asia-east2` (`functions/index.js`, `maxInstances: 10`).

## Map of the code

| File | Role |
|---|---|
| `js/app.js` | auth gate + sign-in page (`COPYRIGHT_NOTICE`), hash router: `routes = [[regex, fn, teacherOnly]]` |
| `js/chrome.js` | top bar + phone tab bar (`STUDENT_NAV`, `TEACHER_NAV`, `setBadge`; `external: true` = link to another site in a new tab, e.g. Simulations) |
| `js/ui.js` | `el(tag, attrs, children)` (sanitises `html:`), `mount`, `toast`, `errMsg`, `fmtDate`, `pct`, `chunk`, `typeset`, `store` |
| `js/fb.js` | Firebase init + `api.<callable>` wrappers (add every new callable here) |
| `js/questions.js` | question loading, syllabus/skill filters, `renderQuestion`, `sourceLabel` |
| `js/quiz.js` | answering (`runQuiz`) and marked review (`showReview`) |
| `js/student.js` | Home, Practise, Redo my mistakes, Leaderboard, My results + My progress |
| `js/teacher.js` | dashboard, classes, assignments (edit/delete/reset), Results, question bank, Question stats, printable paper, admin |
| `js/studentrecord.js` | Students list per class, one student's record |
| `js/feedback.js` | "Explain in class" / "Report a problem" (students) and the Feedback page (teachers) |
| `js/qstats.js` | first-attempt choice statistics |
| `js/explain.js` | Explain cards; `readStats()` (cards read / this week / last) used by progress pages |
| `js/forms.js` | `FORM_CHAPTERS` (F3 → Ch 1, 2, 17, 18, 19) and helpers; mirrored in `functions/index.js` — keep identical |
| `js/docx.js`, `js/roster.js`, `js/syllabus.js` | Word export, class lists, syllabus data |
| `functions/index.js` | callables: `startPractice`, `startMistakes`, `submitAnswers`, `getReview`, `getLeaderboard`, `rebuildLeaderboards`, `explainRead`, `figureData`, `sendFeedback`, `myProgress`, `rebuildMembers`; trigger `syncMembers` |

Firestore collections and who can read them are listed in `README.md` ("Firestore layout"). Collections written only
by functions use `allow write: if false` with teacher read.

## Behaviours to keep consistent

- Reveal modes per assignment: `after_submit` | `after_due` | `manual` (+ `released: true`).
- Practice never serves questions from open assignments. Admin import: bundle `retired` ids (out of syllabus) → `questions/{id}.active = false` and removed from
  `meta/questionIndex`; everything that lists questions must use `active == true` or the index.
- Redo my mistakes = latest *visible* answer wrong/blank;
  `startMistakes({topic?, chapter?, count, preview})`, preview returns `byTopic` + `byChapter` counts.
- Points (`PTS`): 100 per correct answer; +500 (≥90%) / +200 (75–89%) for sets of 5+; 300 for the Explain card of the
  day; +500 weekly check-in on the 3rd active day; each assignment counts once. Hong Kong time.
- F3 students (class name starting with 3) only get Ch 1, 2, 17, 18, 19 in Practise, Redo my mistakes and Explain
  (`FORM_CHAPTERS` in `js/forms.js` and `functions/index.js`); teachers and assignments are not limited.
- Rate limits (`RATE_LIMITS`, teachers exempt) on student-facing callables: call `rateLimit(user, bucket)`.
- Feedback docs: teachers may change only `status`, `handledBy`, `handledAt` and `reply` (string ≤ 300 or null; shown to
  the student on a dismissed report; cleared on Reopen and when the student reports again).

## Adding a feature

1. Server (only if it needs keys, other users' data or trusted writes): new `onCall` → `requireMember` / teacher
   check → `rateLimit` for student calls → validate input → return no keys unless `canReveal`. Add to `api` in `js/fb.js`.
2. Rules: update `firestore.rules` **and** `tests/fakes/rules.mjs`. Composite indexes go in `firestore.indexes.json`.
3. Client: module + route in `js/app.js` (+ nav in `js/chrome.js`); styles appended to `css/style.css` with the
   existing CSS variables; wide tables inside `.scroll`.
4. Tests: a new numbered section in `tests/run.mjs` (before `console.log("10. admin")`): happy path, UI, and security
   (students refused; no direct reads/writes). Derive expected numbers from the data, not hard-coded counts.
5. `python3 tools/bump_version.py`, run the tests, update `README.md`.

## Tests

```bash
cd tests && npm install && node run.mjs      # jsdom + in-memory Firebase fakes; synthetic fixtures; 287 checks
```
- Fakes in `tests/fakes/`: `core.mjs` (store, queries), `firestore.mjs` (client SDK + rules), `functions.mjs`
  (callables in-process; rate-limit counters cleared per call unless `fake.keepRateLimits`), `admin.cjs`
  (firebase-admin incl. merge `set`, `increment`, `runTransaction`), `auth.mjs`.
- GitHub Actions runs the same command on every push and pull request (`.github/workflows/tests.yml`).
- `node run.mjs --real` uses the real exports, which exist only on the maintainer's computer.

## Gotchas

- Users stuck on old JS → always run `tools/bump_version.py`.
- jsdom has no `CSS.escape`, no real navigation; stub `URL.createObjectURL`. `go("#/")` when already on `#/` fires no
  `hashchange` — route via another page in tests.
- The admin fake replaces stored objects on `set`: re-read after each call. Wait for async re-renders before switching
  the signed-in user in tests.
- Storage downloads hit CORS in the browser → figures for Word export come through the teacher-only `figureData` callable.

## Handoff update — after every change

Keep the repo ready for the next agent. Update whatever the change affects:

1. `CHANGELOG.md` — newest entry on top: what changed, files, **push only** or **deploy.command + push**, test count.
2. `README.md` — feature description ("Using it"), Firestore layout, rate limits, testing.
3. This file and `.github/copilot-instructions.md` — code map, callables, behaviours, conventions, test count.
4. `tests/fixtures/` — regenerate with `tools/make_test_fixtures.py` (maintainer's computer) if data shapes change.
5. No real question data, answer keys or credentials in any of these files.

