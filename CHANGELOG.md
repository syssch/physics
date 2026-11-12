# Changelog

Newest first. Each entry says whether the maintainer only needs to **push** (site files) or also run
**`deploy.command`** (Cloud Functions, security rules or indexes changed). Agents: add an entry after every change.

## 2026-11-12

- **Copyright notice on the sign-in page** ("By logging in, you acknowledge…"; wording in `COPYRIGHT_NOTICE` in
  `js/app.js`, style `.signin .disclaimer` in `css/app.css`). *Push.* Tests: 259.

## 2026-11-11

- **Questions now stand alone** (question data, not code): 9 questions that said "Refer to Question 4", "Q.3" or
  "the previous question" were rewritten with the setting (and figure) they need; "(For questions 6 and 7)" labels
  removed from 6 shared-stem questions; 4 solutions updated. `platform_prep/platform_readiness.py` now blocks any
  question that refers to another question. *Re-import `all_ready/bundle.json` (Admin → Import questions); no push or
  deploy needed for this item.*
- **Figures trimmed** (question data): stray "mass /kg" fragment removed from 2015-16 F3 T2 Q4/Q5 graphs, cut-off text
  line removed from the top of 2016-17 F5 E1 Q3 (also used by Q4). Originals in
  `question_bank/archive/backup_fig_trim_20261111/`. *Re-import the bundle (with its figures).*
- **Handoff files for AI agents** — `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`; synthetic test data in
  `tests/fixtures/` (`tools/make_test_fixtures.py`); tests default to fixtures, `--real` for the real exports; GitHub
  Actions runs the tests on every push/PR (`.github/workflows/tests.yml`). *Push.* Tests: 258.
- **Explain cards read** in My progress (students), the Students list and the Student record (teachers);
  `readStats()` in `js/explain.js`. *Push.*
- **My progress** at the top of My results: sets, % correct, by book/chapter with "Practise 5", mistakes waiting;
  hidden-answer assignments counted but not marked. New callable `myProgress` (+ `progress` rate-limit bucket).
  *deploy.command + push.*
- **Question stats** (first attempts only; `js/qstats.js`, route `#/t/qstats`) and first-attempt choice bars in the
  question bank, filter by form/class, hardest first, CSV. *Push.*
- **Students list and Student record** (`js/studentrecord.js`, routes `#/t/students/<class>`,
  `#/t/student/<class>/<email>`); Results names link to the record. *Push.*
- **Practice default 3 questions** (random set and Redo my mistakes). *Push.*
- **Rate limits** per student (`RATE_LIMITS`, `rateLimit()`, `rateLimits/{uid}`; teachers exempt). *deploy.command + push.*
- **Student feedback**: "Explain in class" / "Report a problem" under each reviewed question (`sendFeedback`,
  `feedback/{kind}_{uid}_{qid}`), teacher Feedback page with badge, counts on Results. *deploy.command + push.*
- **Edit / Delete assignment** on the Results page (submissions kept). *Push* (rules already allowed it).

## 2026-11-10

- Leaderboards per form (week / month / all time) with points for practice, assignments, Explain cards and weekly
  check-in; top bar redesign with phone tab bar; Redo my mistakes; Printable paper with Word export; solution figures.
  *deploy.command + push.*
