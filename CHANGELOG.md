# Changelog

Newest first. Each entry says whether the maintainer only needs to **push** (site files) or also run
**`deploy.command`** (Cloud Functions, security rules or indexes changed). Agents: add an entry after every change.

## 2026-11-27

- **Student feedback page shows the student's answer**: each further-explanation request and problem report now shows
  what the student chose for that question — "Answered C ✓", "Answered B ✗ (key C)" or "No answer" — read from their
  result (`attempts/{attemptId}`; teachers may already read results, so no rules or functions change). Works for old
  feedback too. *Push.* Tests: 333.

## 2026-11-26

- **Constants on phones** now slides in from the right like on computers (no bottom sheet); the tab moves with the
  panel's edge and closes it when tapped again. *Push.*

## 2026-11-25

- **Constants tab on phones**: back to the vertical pull-out tab (Shi prefers it; the submit-bar button is gone). The
  label is now rotated with a CSS transform instead of `writing-mode`, which some phone browsers drew with zero width
  (only the border showed). Narrower tab on phones; it hides while the sheet is open; the sheet doesn't reopen by
  itself on phones. *Push.* Tests: 331.
- **Explain cards**: section heading "Teaching notes" renamed **"Points to note"** (display only; card data unchanged). *Push.*
- **Constants tab** is now a solid accent-blue button with white text (dark text in dark theme) so it stands out. *Push.*
- **Constants panel**: the header with the × close button stays fixed; only the list scrolls (`.cst-body`). *Push.*
  Tests: 331.
- **F6 E2 figures** now live in `all_ready/figures/` with the main figures (Shi moved them; all 395 present, incl. the
  6 re-cropped ones). `export_for_platform.py` now deletes only `SYSS-*` files there, so they survive every export.
  Import `bundle-f6e2.json` when ready.
- **Missing data added** (question data): 33 heat questions used the specific heat capacity of water/ice or the specific
  latent heat of fusion/vaporization in the solution without giving it. Each now ends with a "Given: …" line (4200,
  2100, 3.34 × 10⁵, 2.26 × 10⁶). Backups in `question_bank/archive/backup_given_data_20261125/`. *Re-import
  `all_ready/bundle.json`.*
- **Constants pull-out** on every quiz screen (practice, assignments, Redo my mistakes): a "Constants" tab on the right
  edge (bottom right on phones) slides out the HKDSE data sheet — 15 constants exactly as Shi supplied, including
  "(1 u is equivalent to 931 MeV)" and "pc = 3.09 × 10¹⁶ m = 3.26 ly = 206265 AU". Stays open until closed;
  remembered per device (`localStorage.constantsOpen`). New `js/constants.js`; CSS `.cst-*`; hidden on review and print.
  Teacher guide updated. *Push.* Tests: 330.

## 2026-11-20

- **No Boltzmann constant** (question data; not in HKDSE): solutions now use $pV = nRT$, $N = nN_A$, average KE
  $= 3RT/(2N_A)$ and $c_{rms} = \sqrt{3RT/(N_A m)}$. Main bank: 2013-14 F5 E1 Q8, 2016-17 F5 T1 Q8, 2017-18 F6 MOCK 1A Q4,
  2019-20 F5 T1 Q8, 2020-21 F5 E1 Q11, 2020-21 F5 E2 Q4, 2022-23 F5 E2 Q4, 2025-26 F5 E1 Q4, 2025-26 F5 E2 Q4.
  bundle-f6e2: 2023-24 1A Q3, 2018-19 1A Q3. *Re-import both bundles.*
- **Export script fix**: `export_for_platform.py --all-ready` used to delete the whole `export/all_ready/` folder, which
  wiped `bundle-f6e2.json` and `F6 E2 figures/`. It now only replaces `bundle.json` and `figures/`. `bundle-f6e2.json` was
  rebuilt (backup + all fixes); only 6 of 395 F6 E2 figures could be restored — the rest are listed in
  `all_ready/F6E2_missing_figures.txt` and must be copied back from the original source before importing that bundle.
- **Solution updated** (question data): 2013-14 F5 E1 Q8 — statement (3) now explains that both containers have the same
  number of molecules in the same volume, but hydrogen's higher r.m.s. speed gives more frequent collisions with the walls
  (teacher solution). *Re-import `all_ready/bundle.json`.*
- **Renamed** "Explain in class" → **"Request further explanation"** and "Explained in class" → **"Further explained"**
  (the teacher may explain in class or by email). Also "Mark as further explained", the Feedback page heading, results-page
  counts, student record, My reports and the Chat/Email message ("…the question you asked me to explain further"). Data
  unchanged (`kind: "explain"`). *Push.* Tests: 321.
- **My reports and requests in the teacher's student view**: the panel was hidden for teacher accounts; it now shows
  for teachers too (their own reports, or a short preview text when they have none). *Push.* Tests: 321.
- **My reports and requests** (student My results page, below My progress): every problem report and Explain-in-class
  request the student sent, with date, question (source label, links to the result), type, their note and the
  teacher's response (waiting / fixed / checked + note / explained). `myReportsPanel()` in `js/feedback.js`. *Push.* Tests: 320.
- **Solution updated** (question data): 2015-16 F5 T1 Q6 — full derivation ($P = kA$, $E = \rho A h l_f$, $t = E/P \propto h$).
  Teacher solution. *Re-import the bundle.*
- **New paper added** (question data): 2026-27 SYSS F5 E1 Q1–26 (`SYSS-2026-27-F5-E1-Q1`…`Q26`) from the uploaded PDF
  (copied to `Sing Yin Phy Past Papers/F5/E1/`): text, options, 12 figures cropped from the PDF, tags, worked solutions.
  The paper has no key — answers were worked out (check against the school key). All 26 ready; bundle now 3110 questions.
  *Re-import the bundle with the 12 new figures.*
- **Leaderboards by class and for the whole school**: every point now also goes to a class board (`C_<classId>_…`) and a
  whole-school board (`SCHOOL_…`) next to the form board. Students switch with *My class / My form / Whole school*; the
  teacher Leaderboard has a board picker (whole school, F3–F6, any class). `addPoints()` / `boardScopes()` /
  `getLeaderboard({scope, classId})` / `rebuildLeaderboards` in `functions/index.js`; `boardOptions()`/`boardChoice()` in
  `js/ui.js`. *deploy.command + push, then click "Recount from results" once* (fills the new boards from past results). Tests: 319.
- **F6 E2 figures re-cropped** from the DSE papers: 2013-14 1A Q6, 2017-18 1A Q15, 2025-26 E2-2 Q1.4 and Q1.8; 2014-15
  1A Q16 option axes relabelled 1/u (the DSE 2015 paper printed 1/v). All review items are now fixed. *Re-import
  bundle-f6e2.json with these 5 figures.*

## 2026-11-19

- **F6 E2 bundle: all review findings fixed** (question data, `bundle-f6e2.json`): 136 questions rewritten to match their
  figures (numbers, labels, picture-option descriptions, circuits), 34 answer keys corrected, wrong solutions rewritten,
  one more out-of-syllabus question left out (729 questions), 2022-23 1A Q18 figure lettered A–D. Details at the end of
  `platform_prep/export/all_ready/F6E2_review_2026-11-19.md`. *Import bundle-f6e2.json with all files in "F6 E2 figures".*
- **F6 E2 bundle checked and fixed** (`platform_prep/export/all_ready/bundle-f6e2.json`, 2011-12 → 2025-26 F6 E2-1A /
  E2-2 paraphrased DSE questions; figures in `all_ready/F6 E2 figures/`): question ids renamed from
  "2025-26 SYSS F6 E2-1A Q1" to `SYSS-2025-26-F6-E2-1A-Q1` (spaces broke likes, problem reports and in-page links);
  chapter/subtopic list replaced by the main bundle's (its copy would have restored "Celestial Sphere & Apparent
  Motion"); 4 retrograde/zodiac questions retagged to Geocentric & Heliocentric Models; 2 daily-motion questions
  (2014-15 E2-2 Q1.2, 2012-13 E2-2 Q1.5) left out as out of syllabus (listed under `excludedOutOfSyllabus`); broken
  `\varepsilon` in 2016-17 E2-1A Q28 fixed. 730 questions. Original kept in
  `question_bank/archive/backup_f6e2_20261119/`. *Import: Admin → Import questions with bundle-f6e2.json and all files
  in "F6 E2 figures".* Note: these questions exist only in the bundle, not in `question_bank/questions/`.

- **Question fixed** (question data): 2013-14 F5 E2 Q31 — options now "(see fig. A)" … "(see fig. D)" (the old text
  descriptions of C and D were swapped); solution rewritten step by step (size at t = 0, direction, shape). *Re-import the bundle.*
- **Rank emoji on the leaderboard**: 🥇 🥈 🥉 for ranks 1–3 and 🏅 for 4–10, on the student board and the teacher's
  full list (`rankCell()` in `js/ui.js`, `.rank-emoji` in `css/style.css`). *Push.* Tests: 314.
- **Figure fixed** (question data): 2022-23 F4 T2 Q7 — re-cropped from the paper so it shows the velocity arrows
  (P 5 m s⁻¹, Q 3 m s⁻¹, both to the right). Wording: "collide head on" → "move in the same direction, and P catches up and
  collides with Q". *Re-import the bundle and select this figure.*

## 2026-11-17

- **Faster teacher dashboard**: classes are read without their class lists (only counts are shown), every class's
  assignments are fetched in parallel instead of one class after another, each panel fills in as soon as its own
  query returns, and the last result is kept in memory so returning to the dashboard draws at once, then refreshes.
  `teacherHome()` in `js/teacher.js`. *Push.* Tests: 313.
- **Solution figure added** (question data): 2024-25 F3 E1 Q5 — Shi's diagram (O moving left, O′ moving down).
  Teacher solution. *Re-import the bundle.*
- **Solution figure added** (question data): 2025-26 F3 E2 Q1 — Shi's diagram (images P′–S′; line OP′ crosses the
  mirror's line lowest). Teacher solution. *Re-import the bundle.*
- **Solution figure added** (question data): 2024-25 F3 E1 Q4 — Shi's field-of-view diagram (P′ inside, Q′ outside).
  Teacher solution. *Re-import the bundle.*
- **Solution figure added** (question data): 2023-24 F3 E3 Q9 — Shi's diagram (images A′–D′, lines through the mirror's
  left end meeting the boy's path; B′ first). Teacher solution. *Re-import the bundle.*
- **Solution figure added** (question data): 2023-24 F3 E2 Q1 — Shi's field-of-view diagram (R′ outside); solution text
  follows it. Teacher solution. *Re-import the bundle.*
- **Solution figure added** (question data): 2022-23 F6 T1 Q1 — Shi's diagram (X′, boundary line through the mirror's
  right end, X moved 1 m West); solution text follows it. Teacher solution. *Re-import the bundle.*
- **Solution updated** (question data): 2019-20 F6 T1 Q12 — rewritten with similar triangles (h/3 = 1.8/7.6). Teacher
  solution. *Re-import the bundle.*
- **Solution figure replaced** (question data): 2017-18 F6 T1 Q7 — Shi's diagram with a and b marked; solution finds
  a = 1/2 m, b = 1/3 m and adds them (0.833 m). Teacher solution. *Re-import the bundle.*
- **Solution figure added** (question data): 2014-15 F6 T1 Q11 — Shi's diagram (tree's image, similar triangles
  h/0.35 = 7.9/1.2). Teacher solution. *Re-import the bundle.*
- **Solution figure added** (question data): 2014-15 F6 T1 Q10 — Shi's field-of-view diagram (images of P, Q, R inside,
  S outside); solution text follows it. Teacher solution. *Re-import the bundle.*
- **Ch 17 split into 5 subtopics** (taxonomy + question data): the single "Reflection of Light" subtopic (61 questions) is
  now Light and Types of Reflection (5), Laws of Reflection (8), Image in a Plane Mirror (21), Field of View in a Plane
  Mirror (18), Two Mirrors and Periscopes (10); 2018-19 F5 E2 Q29 has two. `chapters.json` (+ topics.json,
  `js/syllabus.js`), fixtures regenerated. Backups in `question_bank/archive/backup_ch17_subtopics_20261117/`.
  *Push, then re-import the bundle.* Tests: 311.
- **Solution figure added** (question data): 2021-22 F6 T1 Q11 — Shi's diagram (door's image, 15 cm / 45 cm); the ratio
  is now written x/60 = 15/45. Teacher solution. *Re-import the bundle.*
- **Solution figure added** (question data): 2023-24 F3 E1 Q4 — Shi's diagram (images P′Q′R′, field of view from O
  through the ends of M); solution text follows it, marked as a teacher solution. *Re-import the bundle.*
- **New Ch 21 subtopic Terminal Voltage and Internal Resistance of a Battery** (taxonomy + question data): 37 Ch 21
  questions where the battery's internal resistance is non-zero (e.m.f. − Ir, terminal voltage / lost volts, V–I graph
  of a cell, finding r) moved there from Circuit Analysis (or Charge, Energy & Battery Capacity); 3 also keep Circuit
  Fault-Finding. Questions saying "negligible / zero internal resistance" are unchanged. `chapters.json` (+ topics.json,
  `js/syllabus.js`), fixtures regenerated. Backups in `question_bank/archive/backup_internal_resistance_20261117/`.
  *Push, then re-import the bundle.* Tests: 311.
- **Circuit solution figures: highlighter colours** (question data): the 7 redrawn-circuit figures (2013-14 F6 Mock 1A
  Q23, 2014-15 F5 E2 Q20, 2020-21 F5 E1 Q19/Q23, 2021-22 F5 E1 Q16, 2024-25 F5 E1 Q20, 2025-26 F5 E2 Q8) now mark
  points at the same potential with the same translucent colour, in both the paper's circuit and the redraw, with a
  key "Same highlighter colour = same potential". Script + plain originals:
  `question_bank/archive/backup_solfig_20261117/highlight/`. *Re-import the bundle* (solution figures are inlined in it).
- **Solution figure added** (question data): 2023-24 F6 T1 Q1 — Shi's ray diagram (images P′Q′R′S′, rays through the
  mirror's right end meeting Tommy's path in the order R, S, P, Q); solution text rewritten to follow it, marked as a
  teacher solution. *Re-import the bundle.*
- **Dark theme**: a moon / sun button on the top bar (left of the initials) switches between light and dark. Saved per
  device in `localStorage.theme` (`theme.js` also understands "auto" = follow the device, no button for it now); `js/theme.js` sets `html[data-theme]`, an inline script in
  `index.html` applies it before the first paint. Colours come from CSS variables: the dark values are the
  `:root[data-theme="dark"]` block at the end of `css/style.css`; `css/app.css` now uses `var(--card)` /
  `var(--input-line)` instead of `#fff` / `#cfd4dc`. Question figures keep a white card; the printable paper and
  printing stay light. Button = `themeButton()` in `js/chrome.js`, style `.theme-btn`. *Push.* Tests: 311.
- **Likes on questions**: students tap **Like** under any question on a review page (once each, tap again to undo; shows
  the count). Students can practise "Liked by students (1+)" or "Popular (3+ likes)"; teachers filter the question
  bank / assignment builder / printable paper by likes (1+ … 10+, Most liked first) and see a like badge in the bank.
  New callable `toggleLike` (rate bucket `like`), collection `likes/{uid}_{qid}`, counts in `meta/likes`,
  `startPractice({minLikes})`; rules + `tests/fakes/rules.mjs`. *deploy.command + push.* Tests: 308.
- **Practice / assignment bottom bar**: darker (`.submitbar` in `css/app.css`, #1d2939 with light text) and the "N of M
  answered" count now sits just before the Submit button (both on the right). *Push.* Tests: 294.
- **Solution updated** (question data): 2025-26 F5 E3 Q19 — the solution now follows its figure (currents 3I splitting
  2I / I in each parallel pair, P = I²R) as Method 1, with the voltage method as Method 2. *Re-import the bundle.*
- **"Continue with another set"** beside *Back* after a practice set (random practice, Practise 5 or Redo my mistakes):
  starts a new set with the same choices. `startSet()` in `js/student.js` (stores `session-opts-<id>`; falls back to the
  session doc), `next` option of `showReview()` in `js/quiz.js`. *Push.* Tests: 293.
- **New Ch 20 subtopic Electric Field** (taxonomy + question data): 80 Ch 20 questions about field lines, field
  strength, zero-field points, uniform fields between plates, oil drops and charged particles in a field moved from
  Electrostatics to Electric Field (90 stay in Electrostatics: charging, induction, Coulomb forces). Questions in other
  chapters unchanged. `chapters.json` (+ topics.json, `js/syllabus.js`), fixtures regenerated. Backups in
  `question_bank/archive/backup_electric_field_20261117/`. *Push, then re-import the bundle.* Tests: 291.
- **Solution updated** (question data): 2025-26 F5 E1 Q19 — Method 1 (total resistance) kept, Method 2 (proportion: branch
  currents 2 : 1, powers 18 + 18(2/3)² + 18(1/3)² + 18(1/3)² = 30 W) added; marked as a teacher solution. *Re-import the bundle.*
- **In progress, on hold (Shi)**: Admin → Usage statistics (`js/usage.js`, route `#/t/usage`, panel at the top of Admin,
  styles at the end of `css/style.css`): active students per day/week (7 / 30 / 90 days / all) and a by-form/class table
  from `activity`, `users` and `classes`. Written but not yet covered by tests or the handoff docs — finish (add a test
  section, docs, teacher guide) before relying on it.
- **Question fixed** (question data): 2017-18 F5 E2 Q23 — with "L3 is short-circuited" the old statements made key D
  wrong (L2 and L4 go out, L1 gets brighter). Statements now (1) L2 will go out, (2) L1 will go out, (3) L1 will be
  brighter, so D is correct; solution rewritten. Earlier results on it are not re-marked. *Re-import the bundle.*
- **Solution figures replaced** (question data): 2025-26 F6 Mock 1A Q17 now shows Shi's ray diagram (S → M2 → M1 → eye,
  with the images of the room) and the view in M1 (image of the wall, image of M2); solution text follows both.
  *Re-import the bundle.*
- **Solution figure** (question data): 2025-26 F6 Mock 1A Q17 — Shi's drawing of the two images of the "ON AIR" sign in
  mirror M1 (lower: laterally inverted; upper: turned through 180°); solution revised around it. *Re-import the bundle.*

## 2026-11-16

- **Chat / Email message uses the full name**: "Hi Chan Tai Man, …" — the English name from the class list (else the
  Google account name, else the email's user part) instead of the first word of the Google name. `fullNameOf()` in
  `js/feedback.js`. *Push.* Tests: 291.
- **Solution figure** (question data): 2013-14 F4 T1 Q10 — v–t graphs of P and Q with the shaded area P gains
  (48 m) and the equal-speed point at 8 s; solution rewritten around it. *Re-import the bundle.*
- **Figures fixed from a report** (question data): 2020-21 F4 T1 Q6 — question figure re-cropped from the paper (v–t graph
  label and the negative parts of the option graphs were cut off); its solution figure was the P/Q graph of Q7–8, so it
  was moved to 2020-21 F4 T1 Q8 (whose solution now shows the working, 6 + 9 = 15 m); Q6 solution rewritten. Originals in
  `question_bank/archive/backup_fig_reports_20261116/`. *Re-import the bundle (with its figures).*
- **Re-tagged** (question data): 2023-24 F5 E3 Q4 (Joule's falling mass and paddle) → Ch 8 only, subtopic Work, Energy &
  Power (book Force and Motion; was Change of State & Latent Heat, Ch 3). *Re-import the bundle.*
- **Re-tagged** (question data): 2019-20 F6 Mock 1A Q11 (tennis ball hit horizontally over the net) → Projectile Motion
  (Ch 10, was Kinematics Ch 5). *Re-import the bundle.*
- **Book 3 re-tagged to match Shi's Ch 13 and Ch 16 notes** (question data + taxonomy): Ch 16 renamed **Light and
  Sound**; subtopics Sound & Ultrasound (from Ch 13), Echoes (from Ch 14) and Sound Interference (from Ch 15) moved into
  Ch 16; new Ch 16 subtopic Comparison of Light and Sound. 72 questions changed (38 on the platform): sound questions
  now Ch 16; two-loudspeaker questions Ch 15 + 16; earthquake, energy-transfer and string wave-speed questions →
  Wave Properties (Ch 13); ripple-tank / generic double-slit questions → Ch 15; prism dispersion → Ch 18 too.
  Explain cards 2025-Q10bii and 2018-Q7bi → Ch 16. `question_bank/config/chapters.json` (+ topics.json), `js/syllabus.js`,
  fixtures regenerated. Backups in `question_bank/archive/backup_ch13_16_retag_20261116/`. *Push, then re-import the
  bundle and the Explain cards.* Tests: 290.

## 2026-11-15

- **Circuit solution figures** (question data): 5 more tricky networks get the paper's circuit (key points labelled)
  beside a rectangular redraw, with solutions rewritten around them — 2014-15 F5 E2 Q20 (one redraw per position of F),
  2020-21 F5 E1 Q19, 2020-21 F5 E1 Q23, 2024-25 F5 E1 Q20, 2025-26 F5 E2 Q8. Script `draw_circuits_5.py` in
  `question_bank/archive/backup_solfig_20261115/`. *Re-import the bundle.*
- **Chat / Email shortcuts** on the teacher Feedback page: next to each student who asked "Explain in class" —
  *Chat* opens Google Chat in a new tab and copies the student's email (Chat has no link that opens a DM by email), then
  *Copy message* copies a ready message (question + their note); *Email* opens a Gmail draft to the student with that
  message. `contactLinks()` in `js/feedback.js`. *Push.* Tests: 290.
- **Solution figure** (question data): 2021-22 F5 E1 Q16 — the network (A₁, A₂, A₃ marked) beside a rectangular redraw:
  inner wire triangle → one point M, two parallel pairs in series (R/2 + R/2 = R), top two resistors carry no current;
  solution rewritten around it. Script and old figure in `question_bank/archive/backup_solfig_20261115/`. *Re-import the bundle.*
- **Solution figure** (question data): 2013-14 F6 Mock 1A Q23 — the circuit (points P, Q, X marked) beside a rectangular
  redraw showing two parallel groups in series (2 Ω + 1.5 Ω); solution rewritten around it. Drawing script in
  `question_bank/archive/backup_solfig_20261115/`. *Re-import the bundle.*
- **Answer key fixed** (question data): 2024-25 F4 E2 Q19 B → C (KE 2025 J ÷ 425 J per block = 4.8, so through 4
  blocks). *Re-import the bundle.* Earlier results on this question are not re-marked automatically.
- **Fact fix** (question data): 2018-19 F4 T1 Q10 — the hammer-and-feather drop was David Scott (Apollo 15) in 1971,
  not Armstrong in 1969; statement (1) now "…independent of the massive object the astronaut is standing on";
  solution explains each statement (answer C unchanged). *Re-import the bundle.*

## 2026-11-14

- **Wording** (question data): 2014-15 F4 E2 Q1 statement (3) → "If the path taken is a straight line in a single
  direction, …"; solution explains each statement (answer D unchanged). *Re-import the bundle.*
- **Note when dismissing a problem report**: on the teacher Feedback page *Dismiss…* opens a box for an optional short
  note (≤ 300 characters, e.g. "The key is correct: …"); the student's review page then shows "Your teacher checked your
  report: “…”". Stored as `reply` on the feedback doc (cleared on Reopen or a new report). `js/feedback.js`,
  `firestore.rules` (+ `tests/fakes/rules.mjs`). *deploy.command (rules) + push.* Tests: 287.
- **Handoff check**: test fixtures regenerated from the current export (now carry `retired`), README leaderboard
  wording, copilot note on retired questions. *Push.* Tests: 282 (fixtures and `--real`).
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
