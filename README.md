# SYSS Physics Practice

A practice platform for Sing Yin Secondary School physics students. Students sign in with their
school Google account (students @syss.edu.hk, staff @singyin.edu.hk), do assignments set by teachers, and practise random past-paper
multiple-choice questions by topic. Teachers create classes and assignments and see results.

- **Website:** static files served by GitHub Pages at https://syssch.github.io/physics/
- **Data and sign-in:** Firebase project `singyin-physics` (Authentication, Firestore, Storage)
- **Marking:** Cloud Functions in `functions/`. Answer keys are only readable by teachers. A
  student's browser never receives them before the student is allowed to see them, so answers
  can't be read with the developer tools.

The question data is **not** in this repository. It is uploaded from the teacher's computer
through the Admin page (see step 5). 

---

## One-time setup

### 1. Firebase console (https://console.firebase.google.com/project/singyin-physics)

1. **Upgrade to the Blaze plan**: gear icon, then *Usage and billing*, then *Details & settings*,
   then *Modify plan*. Cloud Functions need Blaze. A school's usage should stay within the free
   allowance. Set a budget alert (e.g. US$5) so you are emailed if it ever doesn't.
2. **Authentication**: *Build*, then *Authentication*, then *Get started*. Under *Sign-in method*,
   enable **Google**. Under *Settings*, then *Authorized domains*, add `syssch.github.io`.
3. **Firestore**: *Build*, then *Firestore Database*, then *Create database*. Choose location
   **asia-east2 (Hong Kong)** and start in **production mode**.
4. **Storage**: *Build*, then *Storage*, then *Get started*. Use the same location.
5. **Register the web app**: gear icon, then *Project settings*. Under *Your apps*, click the
   `</>` (Web) button, give it any nickname, and click *Register*. Copy the values of `apiKey`,
   `messagingSenderId` and `appId` into `js/config.js`. Check that `storageBucket` matches too.
6. **Make yourself a teacher**: go to *Firestore Database*, then *Start collection*, and name it
   `teachers`. Set the document ID to your school email in lower case (e.g.
   `syssch@singyin.edu.hk`). Add one field (e.g. `role` = `teacher`) and save. Other teachers
   can be added later from the Admin page.

### 2. Deploy the security rules and Cloud Functions (from your Mac)

You only need to do this once, and again after changes to the rules or `functions/`.

1. Install **Node.js 22 LTS** from https://nodejs.org.
2. In Terminal:
   ```bash
   npm install -g firebase-tools
   firebase login
   cd ~/"Claude/Projects/HKDSE Physics Database/learning-platform"
   (cd functions && npm install)
   firebase deploy --only firestore,storage,functions
   ```
   If it asks whether Storage rules may read Firestore, answer **yes**. If it asks about a cleanup
   policy for container images, accept the default.

### 3. Publish the website on GitHub

1. Upload everything in `learning-platform/` to the root of https://github.com/syssch/physics,
   except `functions/node_modules` and `tests/node_modules`. GitHub Desktop is the easiest way;
   dragging the files into *Add file*, then *Upload files* on github.com also works.
2. On the repository, open *Settings*, then *Pages*. Under *Build and deployment*, choose
   *Deploy from a branch*, then `main` and `/ (root)`, then *Save*. After a minute the site is at
   https://syssch.github.io/physics/.

### 4. Ask the school's Google Workspace administrator

Google Workspace for Education can stop student accounts, especially those marked as under 18,
from signing in to apps the school hasn't approved. Ask IT to allow this app:

*Google Admin console*, then *Security*, then *Access and data control*, then *API controls*,
then *Manage third-party app access*, then *Configure new app*. Search for the OAuth client ID
of this project and set it to **Trusted**. The client ID is in Google Cloud console, under
*APIs & Services*, then *Credentials*, then *Web client (auto created by Google Service)*.

Until this is done, test with teacher accounts or a few adult accounts.

### 5. Upload the questions

1. On your Mac, build the bundle:
   ```bash
   cd ~/"Claude/Projects/HKDSE Physics Database"
   python3 platform_prep/platform_readiness.py               # refresh the "ready" list after any data fix
   python3 platform_prep/export_for_platform.py --all-ready  # every ready SYSS question -> platform_prep/export/all_ready/
   # python3 platform_prep/export_for_platform.py            # (just the 100 trial questions -> export/trial/)
   ```
   "Ready" means the question has no figure, or its figures were checked against the original paper, and it
   **stands alone** — it doesn't refer to another question ("Refer to Q.4", "the previous question", "For questions 6
   and 7"); such questions are blocked until rewritten with the information they need. Exact duplicates are left out. Questions with unchecked or missing figures are added as their papers are checked:
   `platform_prep/figure_check.py` compares each stored figure with the original paper and proposes fresh crops,
   and `platform_prep/apply_figure_checks.py` applies the reviewed result and records the paper in
   `platform_prep/figure_checks.json` (the list of checked papers).
2. On the website, sign in, then open *Teacher*, then *Admin*, then *Import questions*. Choose
   `bundle.json` and select **all** the files in its `figures` folder, then click *Import*.
   Importing again later updates questions that have the same ID and adds new ones; nothing is removed.
   The import also updates `meta/questionIndex`, a small list of every question's book, chapter, subtopic and skills,
   so starting a practice set costs one database read instead of one per question.

**Never put `bundle.json` on GitHub.** It contains the answer keys.

### 6. Load the Explain cards (Paper 1B "explain" questions)

1. On your Mac, build the cards from the booklet in the project folder:
   ```bash
   cd ~/"Claude/Projects/HKDSE Physics Database"
   python3 platform_prep/export_explain_cards.py     # writes platform_prep/export/explain/explain_bundle.json
   ```
   Each card is tagged with a textbook chapter (Books 1–7) in `platform_prep/explain_chapters.csv`. To re-tag a
   card, change its `chapter` number in Excel and run the script again (chapter numbers: 1–27 for Books 1–5,
   `A1`–`A4` for Book 6, `W1`–`W3` for Book 7; see `explain_chapters.json`).
2. On the website: *Teacher → Admin → Import Explain cards*, then choose `explain_bundle.json`. Re-importing
   (e.g. after you edit the booklet) replaces the cards; students keep their read marks.


---

## Using it

**Who can use it:** teachers on the teacher list, and students whose email is on at least one class list.
Any other school account sees "this site is only for SYSS Physics students" and can't read anything. This is
enforced by the security rules and Cloud Functions, not just hidden on screen. The access list (`members`)
updates itself whenever a class is saved or deleted.

**Teachers** (*Teacher* tab):
- *New class*: give the class a name and paste the students' school emails, one per line.
- *New assignment*: pick the class, title, due date, and whether answers are shown right after
  submitting or only after the due date. Filter by book → chapter → subtopic (each narrows the next), skill tested, form or text, tick
  questions, or add random ones from the current filter.
- *Edit / Delete assignment* (on its Results page): change the title, due date or when answers are shown (questions can't
  be changed once set). Deleting removes it from students' Home pages and the dashboard; submitted results, My results
  and leaderboard points are kept, and its answers count as shown.
- *Results*: shows each student's answer to each question (green is right, red is wrong), the
  percentage correct per question, and how many students chose each option. You can download a
  CSV.
- *Admin → Classes & students*: see all classes, edit or delete them, and **paste class lists** straight from
  Excel or Google Sheets — the school's columns `Class | Number | Name | CName | Email` (header row skipped); one student per row
  (class + email alone also works). Teachers then see students as "4A 12 Chan Tai Man 陳大文", in class-number order.
  Names and numbers are stored in a teacher-only `classRosters` document, so students never see classmates' details. Choose whether the paste
  replaces each named class's list or adds to it; *Check* shows what will change before you *Apply*.
  *Check access* tells you whether a given student can sign in. At the start of a new school year, paste the
  new lists with "Replace" (and delete classes that no longer exist) so leavers lose access.
- *Admin*: also add or remove teachers, and import questions and Explain cards.
- *Printable paper*: pick questions (same filters as the assignment builder, with "add random" and ↑/↓ to reorder),
  or click *Print* beside any assignment on the dashboard to start from its questions. Set a title, subtitle and time
  allowed, and choose: Name/Class/No. lines, answer boxes, each question's source, an answer key page, worked
  solutions pages, shuffled order. *Preview & print* shows an A4 layout; print it or choose "Save as PDF" in the print
  dialog, or *Download Word (.docx)* for an editable file (maths become real Word equations; figures are fetched by the
  teacher-only `figureData` Cloud Function, built in the browser by `js/docx.js`). Nothing is saved on the platform.
- *Question stats* (Questions → Question stats, `#/t/qstats`, `js/qstats.js`): every attempted question with how students
  answered it the **first time** they met it (practice, Redo my mistakes or an assignment; later attempts and staff accounts
  are not counted): number of students, % correct, and counts for A/B/C/D/blank with the key highlighted. Filter by
  book/chapter/skill/form/text and by students (all, a form such as F4, or a class) and a minimum number of students;
  sort by any column (hardest first by default); *Show* opens the question; CSV. The *question bank* shows the same
  summary bar under each question (tick "Show students' first-attempt choices"), with the same student filter and
  "Hardest first" / "Most attempted" ordering. Built in the teacher's browser from `attempts` (reloaded each time the
  stats page opens; the bank reuses it for 5 minutes).
- *Students* (button on each class on the dashboard, `#/t/students/<class>`): every student in the class with sets done,
  sets in the last 7 days, questions answered, % correct, assignments submitted, Explain cards read and last active. Click a name (here or on
  any Results grid) for the student's *record* (`js/studentrecord.js`): summary (sets by type, % correct, assignments
  submitted / late / overdue, Explain cards read, last active), % correct by book and by chapter (weakest first, marked against the current
  answer keys), every practice set, Redo my mistakes and assignment with *View* (each question with the student's answer,
  the key and solution), questions whose latest answer is wrong, overdue assignments and the student's feedback. CSV of the
  sets list. Reads `attempts` by email (no extra index needed).
- *Student feedback* (*Feedback* in the top bar, with the number not yet dealt with): students' "Explain in class"
  requests, grouped by question with how many asked, who, and their notes (most requested first), and their problem
  reports (type, note, student, where they saw it). Filter by class (practice-set feedback appears under all of the
  student's classes). Open any item's question with its answer and solution. *Mark as explained* / *Mark fixed* /
  *Dismiss* (and *Reopen*); the student sees the outcome on their review page. Fix a reported question in the question
  bank app, re-export and import it as usual. Each assignment's *Results* page also counts requests and reports per
  question and lists them under each question.
- *Explain reading*: for each class, how many Explain cards each student has marked read (total, last 7 days, last date) and which chapters they chose.

**Top bar** (`js/chrome.js`): students get Home (with "N due" for assignments not yet submitted), Practise (random
set + Redo my mistakes), Explain, Leaderboard and My results, plus "4A · 132 pts". Teachers get Classes, Assign, Feedback,
Questions (question bank, printable paper), Leaderboard and Explain, a Teacher | Student switch, and an initials button
(name, Admin, Sign out). On phones the links move to a bottom tab bar and a ☰ menu. Icons: Tabler icons webfont (CDN).

**Students**:
- *Home* lists their assignments with due dates and scores.
- *Practise*: choose a book, chapter (e.g. "Ch 9 Momentum"), subtopic and/or skill (e.g. "Graph & data analysis"), and the number of questions. Questions in assignments that
  are still open are never given as practice, so practice can't be used to find assignment
  answers.
- *Redo my mistakes*: a practice set (5–20 questions, optionally one book) made of the questions the student got wrong
  or left blank the last time they answered them. A question leaves the list once it is answered correctly. Only results
  whose answers the student can already see count (an assignment with hidden answers adds nothing until it is released),
  and questions in open assignments are left out. Built by the `startMistakes` Cloud Function from the student's
  `attempts`; the redo attempt is saved like practice, titled "Redo my mistakes".
- *Leaderboard* (home page): the student's form (from the class name, e.g. 4A → F4) for this week, this month and all
  time (Hong Kong time; weeks start on Monday). Points: 100 per correct answer in practice and assignments (including Redo my mistakes; each assignment once;
  sets of 3, 5, 10, 15 or 20), +500 for 90%+ or +200 for 75–89% in sets of 5 or more; 300 for marking the Explain card of
  the day as read (once a day, `explainRead` function); +500 check-in bonus once a week on the 3rd day with any practice
  set, assignment or card of the day (`activity/{uid}_{day}`, `checkinBonus/{uid}_{week}`). Students see the
  top 10 (class + name from the class list) and their own rank. Totals live in `leaderboards/{form}_all`, `{form}_week_{2026-W46}`,
  `{form}_month_{2026-11}` (teacher-readable, written only by Cloud Functions). Teachers: *Leaderboard* on the dashboard
  shows the full list for any form; *Recount from results* rebuilds the current totals from saved practice results.
- *My results*: every past attempt, with a review page for each. At the top, *My progress* (`myProgress` Cloud Function):
  sets done (practice / redo / assignments), questions answered, % correct, sets this week, Explain cards read, % correct by book and by
  chapter (weakest first; chapters with 3+ answers, each with *Practise 5*), and how many questions are waiting in Redo my
  mistakes. Assignments whose answers are still hidden count as sets but are not marked, so nothing is given away.
- *Feedback on a question* (review page, under each question): *Report a problem* (answer key may be wrong, typo or unclear
  wording, figure missing or wrong, solution wrong or unclear, something else, plus an optional note) at any time;
  *Explain in class* (one tap, optional note, *Undo*) once the solutions are shown. Sent by the `sendFeedback` Cloud
  Function, which checks the result is the student's and the question is in it; one request and one report per student
  per question (sending again replaces it).
- *Explain*: the 134 Paper 1B explanation questions, each with the marking scheme, teaching notes and examiners'
  comments. Home shows a *card of the day* (the first unread card in the student's chosen chapters; it stays the same all
  day). Cards are grouped by textbook book and chapter (e.g. "Book 2 · Ch 9 Momentum"). Students tick the chapters
  they have learnt, can open any card, and tap *Mark as read*.

**Rate limits** (`RATE_LIMITS` in `functions/index.js`; teachers are not limited): per student, per 10 minutes / per
Hong Kong day — practice sets started (incl. Redo my mistakes) 20 / 150, sets submitted 20 / 150, result reviews 60 / 600,
leaderboard views 60 / 600, Explain cards marked 20 / 100, feedback messages 30 / 150. Past a limit the student sees
"Slow down a little … try again in N minutes" (or "today's limit … resets at midnight"). Counters: `rateLimits/{uid}`.
All functions also run at most 10 instances at once (`maxInstances`).

Each assignment can be submitted once. Late submissions are accepted and marked "late".
Unfinished answers are saved in the browser, so reloading the page doesn't lose them.

## Firestore layout

| Collection | Contents | Who can read |
|---|---|---|
| `questions/{id}` | text, options, figure file names, `subtopics` (plus `chapters` and `topic` = book, which follow from them) | anyone at school |
| `answerKeys/{id}` | `answer` | teachers |
| `teachers/{email}` | teacher list | teachers (and each person checking themselves) |
| `users/{uid}` | name, email, last login | the user, teachers |
| `members/{email}` | access list: which classes a student is in (written only by Cloud Functions) | the student, teachers |
| `classRosters/{id}` | class numbers and names for a class | teachers |
| `classes/{id}` | name, `studentEmails` | teachers, students in the class |
| `classes/{id}/assignments/{id}` | title, `questionIds`, `dueAt`, `reveal` | teachers, students in the class |
| `attempts/{id}` | responses, score (written only by Cloud Functions) | the student, teachers |
| `meta/questionIndex` | each question's book, chapters, subtopics, skills (no answers) — used to pick practice questions | anyone at school |
| `meta/explainCards` | all Explain cards in one document | anyone at school |
| `explainProgress/{uid}` | a student's read marks, chosen chapters (`topics`), today's card | the student, teachers |
| `rateLimits/{uid}` | per-student usage counters for the rate limits (Cloud Functions only) | teachers |
| `sessions/{id}` | practice sets (written only by Cloud Functions) | the student |
| `feedback/{kind}_{uid}_{qid}` | "explain" request or "error" report: question, type, note, class(es), assignment, `status` open/done/dismissed (written by `sendFeedback`; teachers may change only the status) | the student, teachers |

## Testing changes locally

`tests/run.mjs` drives the whole app (teacher and student flows, marking, and the rules
mirrored in `tests/fakes/rules.mjs`) against an in-memory Firebase. It doesn't need any
network access.

```bash
cd tests && npm install && node run.mjs          # synthetic test data in tests/fixtures/ (works anywhere)
node run.mjs --real                              # the real exports in ../platform_prep/export (your Mac only)
```

The fixtures (`tests/fixtures/*.json`) keep the real ids, books, chapters and skills but replace every question text,
option, answer letter and Explain card text with made-up content, so they are safe in this public repo. Rebuild them
after big changes to the question bank with `python3 tools/make_test_fixtures.py`. GitHub runs the fixture tests on every
push and pull request (`.github/workflows/tests.yml`; a red ✗ on the commit means something broke).

If you change `firestore.rules`, update `tests/fakes/rules.mjs` to match.

### Working with other AI coding agents

`AGENTS.md` (read by Codex, Cursor, Copilot, Gemini CLI and others), `CLAUDE.md` (Claude Code) and
`.github/copilot-instructions.md` tell an agent the rules, the code map, the feature checklist and how to test. Every change is logged in `CHANGELOG.md`, with whether it needs only a push or also `deploy.command`. Review
an agent's changes in GitHub Desktop before pushing, and never give it Firebase or GitHub credentials — deploy with
`deploy.command` yourself.

## Updating the site's code

After changing anything in `js/` or `css/`, run `python3 tools/bump_version.py` before committing. It adds a version
tag (`?v=202611102231`) to every script and stylesheet address, so browsers load the new files at once instead of
using copies they saved earlier (GitHub Pages lets browsers keep files for 10 minutes, and module scripts can stick
longer).
