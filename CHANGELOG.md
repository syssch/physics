# Changelog

Newest first. Each entry says whether the maintainer only needs to **push** (site files) or also run
**`deploy.command`** (Cloud Functions, security rules or indexes changed). Agents: add an entry after every change.

## 2026-11-13

- **Search by source**: the teacher search box (question bank, assignment builder, printable paper, question stats) also
  finds questions by source — "2018-19 F4 E2 Q1" (exact; Q1 ≠ Q10), "F4 E2 2018-19" (whole paper), "Q12", the id
  "SYSS-2018-19-F4-E2-Q1" or "Q.1". `searchMatcher()` in `js/teacher.js`. *Push.* Tests: 275.
- **Browser tab icon**: an atom favicon (`favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` for phone home
  screens; links in `index.html` with `?v=1` — bump that number if the icon changes). *Push.* Tests: 270.
- **Statement-question solutions** (question data): in (1)(2)(3)-type solutions the explanations for (2), (3) (and (4))
  now start on new lines (681 solutions). Originals zipped in
  `question_bank/archive/backup_statement_linebreaks_20261113.zip`. *Re-import the bundle.*
- **Thermometer solutions** (question data): 18 more thermometer-calibration calculations now show a "Method 1 — rate
  of change" first (e.g. 0.25 cm °C⁻¹, L = 5 + 0.25T) and "Method 2 — proportion" second (all 19 have both).
  *Re-import the bundle.*
- **Solution updated** (question data): 2024-25 F4 E1 Q1 now shows a rate-of-change method (0.15 and 0.1 cm °C⁻¹,
  3 + 0.15T = 5 + 0.1T) before the proportion method; marked as a teacher solution. *Re-import the bundle.*
- **F3 chapter limit**: students in F3 classes (class name starting with 3) only get Ch 1, 2, 17, 18, 19 in Practise,
  Redo my mistakes, "Practise 5" and Explain cards (questions tagged only with those chapters, from any form's papers).
  Teachers, F4–F6 and assignments are not affected. Config `FORM_CHAPTERS` in `js/forms.js` **and**
  `functions/index.js` (test checks they match). *deploy.command + push.* Tests: 269.
- **Wording fix from a student report** (question data): 2017-18 F3 E2 Q6 — statement (3) now says "the same mass of a
  liquid with smaller specific heat capacity" and the stem says each change is made on its own; solution explains why.
  *Re-import the bundle, then mark the report "fixed".*

## 2026-11-12

- **Picture-option figures checked** (question data): all 143 questions whose options are pictures were reviewed by eye.
  12 re-cropped from the papers because option letters or diagrams were missing/garbled (e.g. 2021-22 F5 E2 Q29 had no
  letters, 2024-25 F6 Mock 1A Q15 had no option graphs, several were missing "A." and "C."); 10 had stray question
  text removed. New tool `platform_prep/recrop_from_paper.py`. Originals in
  `question_bank/archive/backup_fig_picopt_20261112/`. *Re-import the bundle.*
- **Figures fixed from student reports** (question data): 2018-19 F4 T1 Q5 (option letters A and C were cropped off)
  and 2024-25 F4 E2 Q15 (the four option diagrams were missing) re-cropped at 300 dpi from the papers. Originals in
  `question_bank/archive/backup_fig_reports_20261112/`. *Re-import the bundle, then mark both reports "fixed".*
- **Simulations link** in the top bar for students and teachers → https://syssch.github.io/physim/ (new tab;
  `external: true` nav items in `js/chrome.js`, kept out of the phone tab bar, shown in the ☰ menu). *Push.* Tests: 261.
- **Copyright notice on the sign-in page** ("By logging in, you acknowledge…" — school copyright; HKEAA mention removed; wording in `COPYRIGHT_NOTICE` in
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
