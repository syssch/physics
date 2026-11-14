# Changelog

Newest first. Each entry says whether the maintainer only needs to **push** (site files) or also run
**`deploy.command`** (Cloud Functions, security rules or indexes changed). Agents: add an entry after every change.

## 2026-11-14

- **Drift velocity out of syllabus** (question bank only): DSE 2015 1A Q27 marked `out_of_syllabus`; no SYSS question on
  the platform uses drift velocity / I = nAvQ. *Nothing to re-import for this item.*
- **Old papers screened for out-of-syllabus content** (question data): 2013-14 and 2014-15 papers predate the HKDSE
  2016 syllabus change. Newly marked `out_of_syllabus` (→ bundle `retired`): daily motion on the celestial sphere
  (2013-14 F6 Mock 2 Q1.2, 2014-15 F6 Mock 2 Q1.2; DSE 2012–2015 Paper 2 in the bank), electric PE / equipotentials
  (2013-14 F5 E2 Q20, 2014-15 F5 E2 Q16, 2014-15 F5 T2 Q11), Hall effect (2014-15 F6 Mock 1A Q29; DSE 2015 1A Q30).
  Re-tagged 2019-20 F6 Mock 2 Q1.2 (→ Geocentric & Heliocentric Models) and 2020-21 F6 Mock 2 Q1.1 (→ Scale of the
  Universe), which were wrongly under Celestial Sphere. 13 questions retired in all. *Re-import the bundle.*
- **2-D collisions out of syllabus** (question data): 2013-14 F4 E2 Q17, 2013-14 F5 E2 Q15 and 2013-14 F6 Mock 1A Q10
  (plus DSE 2012 1A Q13 in the bank) marked `out_of_syllabus` → in the bundle's `retired` list. *Push (if not yet), then
  re-import the bundle.*
- **Out-of-syllabus questions removed** (question data + import): electric potential due to a point charge is no longer
  in the syllabus. 2013-14 F5 T2 Q9 and Q11, 2013-14 F6 Mock 1A Q22 and 2014-15 F6 Mock 1A Q22 (plus DSE 2012 1A Q25
  and DSE 2014 1A Q23 in the bank) are marked `out_of_syllabus` and kept in the bank. The export lists them in the
  bundle's new `retired` field; Admin → Import sets them inactive and removes them from the practice index (old
  results and assignments still show them). `platform_readiness.py`, `export_for_platform.py`, `js/teacher.js`.
  *Push, then re-import the bundle.* Tests: 282.

## 2026-11-13

- **Figure fixed from a student report** (question data): 2018-19 F3 T1 Q1 showed only 2 of the 3 graphs (graph (1),
  constant R, was missing) and no (1)(2)(3) labels; re-cropped from the paper with labels, solution explains each graph.
  Original in `question_bank/archive/backup_fig_reports_20261113/`. *Re-import the bundle (with its figures), then mark
  the report "fixed".*
- **Redo my mistakes by chapter**: the menu now lists each book and its chapters with the number of mistakes waiting
  (e.g. "Ch 9 Momentum (4)"); students pick all, one book or one chapter. `startMistakes` takes `chapter` and its
  preview returns `byChapter`; `mistakesPanel(books)` in `js/student.js`. *deploy.command + push.* Tests: 281.
- **Leaderboard wording for students**: above the top 10 the board now always says "You have **1,200** points, ranking
  **3** of **45**" for the chosen period ("You have 0 points — not ranked yet" if none); replaces "You: #3 of 45, …",
  which only showed when outside the top 10. `myRankLine()` in `js/student.js`, `.my-rank` in `css/style.css`. *Push.* Tests: 277.
- **Statement solutions re-laid out** (question data): 44 (1)(2)(3)-type solutions had line breaks in the middle of
  sentences ("… light is slower in X —<br>(2) ✓") or verdicts after the reasoning. Now each line starts with the
  statement and its verdict, then the reason, e.g. 2025-26 F6 Mock 1A Q18. Originals in
  `question_bank/archive/backup_statement_breaks_20261113/`. *Re-import the bundle.*
- **Solution updated** (question data): 2024-25 F5 E3 Q28 — final step now uses tan c = sin c / cos c = 2/√3 ⇒
  c = 49.1°, n = 1/sin c = 1.32 (instead of sin²c + cos²c = 1); marked as a teacher solution. *Re-import the bundle.*
- **Admin → Check figures**: lists every figure file used by a question that is missing from Firebase Storage (with
  the questions using it), e.g. 2023-24 F6 T1 Q2 showing "Figure could not be loaded" because its PNG was not
  selected at an earlier import. Fix: import again with those files selected. *Push.* Tests: 276.
- **Typo fixed** (question data): 2023-24 F3 E2 Q4 option D — 內鎵鏡 → 內窺鏡 (endoscope). *Re-import the bundle.*
- **Figure cropped** (question data): 2022-23 F5 E2 Q31 — the upper diagram (Q30's media W/X/Y/Z) removed; only the
  prism remains. Original in `question_bank/archive/backup_fig_reports_20261113/`. *Re-import the bundle.*
- **Re-tagged** (question data): 2021-22 F6 T1 Q10 → Total Internal Reflection of Light (Ch 18); 2025-26 F6 Mock 1A Q15
  (water waves) → Reflection, Refraction & Diffraction of Waves (Ch 14, was Refraction of Light). *Re-import the bundle.*
- **Solution updated** (question data): 2014-15 F6 T1 Q12 — step-by-step: refractive indices from n = c/v, Snell's law
  at each boundary (87.7°, then 41.8°), shortcut last. *Re-import the bundle.*
- **Wavelength of light → Ch 16 only** (question data): 2013-14 F6 T1 Q4, 2021-22 F6 T1 Q5, 2022-23 F6 T1 Q3 and
  2024-25 F5 E3 Q30 no longer carry a Ch 18 tag (subtopic EM Spectrum only). *Re-import the bundle.*
- **Re-tagged** (question data): 2024-25 F6 T1 Q2 (water waves, shallow → deep) moved from Refraction of Light (Ch 18)
  to Reflection, Refraction & Diffraction of Waves (Ch 14). *Re-import the bundle.*
- **Wavelength of light → also Ch 16** (question data): optics questions whose text involves the wavelength of light
  keep their tag and also get Ch 16 (subtopic EM Spectrum): 2013-14 F6 T1 Q4, 2021-22 F6 T1 Q5 (also Total Internal
  Reflection), 2022-23 F6 T1 Q3, 2024-25 F5 E3 Q30, and DSE 2018 1A Q16 (bank only). *Re-import the bundle.*
- **Total internal reflection re-tag** (question data): every question whose text, options or solution mentions "total
  internal reflection" or "critical angle" now has the single subtopic Total Internal Reflection of Light (Ch 18) —
  19 changed (16 SYSS on the platform, 3 DSE); ones about total internal reflection of sound go to Ch 16 (EM Spectrum).
  Originals in `question_bank/archive/backup_tir_retag_20261113.zip`. *Re-import the bundle.*
- **Re-tagged** (question data): 2017-18 F6 T1 Q9 and 2020-21 F6 Mock 1A Q18 → subtopic Total Internal Reflection
  of Light (Ch 18).
  *Re-import the bundle.*
- **Re-tagged** (question data): 2016-17 F6 T1 Q12 (wavelength of light in a medium) moved from Ch 18 to Ch 16 Light
  Waves (subtopic EM Spectrum). *Re-import the bundle.*
- **Re-tagged** (question data): 2016-17 F6 Mock 1A Q19 → subtopic Total Internal Reflection of Light (was Refraction
  of Light; still Ch 18). *Re-import the bundle.*
- **Solution updated** (question data): 2013-14 F6 T1 Q8 — Snell's law at the bottom face (n sin 47° = 1 × sin 90°) as
  Method 1, without the critical angle; critical-angle method kept as Method 2. *Re-import the bundle.*
- **Solution figure redrawn** (question data): 2025-26 F3 E1 Q3 — the image of "SING YIN" is now drawn in red behind the
  mirror, with dashed perpendicular construction lines; solution text mentions it. *Re-import the bundle.*
- **Re-tagged** (question data): 2021-22 F6 T1 Q6 (light vs sound) moved from Ch 17 to Ch 16 Light Waves (subtopic
  EM Spectrum). *Re-import the bundle.*
- **2024-25 F3 E3 Q2** (question data): now shows the front view from Q1 (mirror on the ground in front of the school)
  above the four options, with a lead-in sentence so it stands alone. *Re-import the bundle.*
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
