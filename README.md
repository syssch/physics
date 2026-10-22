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

1. On your Mac, build the bundle (this creates `platform_prep/export/trial/`):
   ```bash
   cd ~/"Claude/Projects/HKDSE Physics Database"
   python3 platform_prep/export_for_platform.py              # the 100 trial questions
   # python3 platform_prep/export_for_platform.py --all-ready  # later: every checked question
   ```
2. On the website, sign in, then open *Teacher*, then *Admin*, then *Import questions*. Choose
   `bundle.json` and select **all** the files in its `figures` folder, then click *Import*.
   Importing again later updates questions that have the same ID.

**Never put `bundle.json` on GitHub.** It contains the answer keys.

### 6. Load the Explain cards (Paper 1B "explain" questions)

1. On your Mac, build the cards from the booklet in the project folder:
   ```bash
   cd ~/"Claude/Projects/HKDSE Physics Database"
   python3 platform_prep/export_explain_cards.py     # writes platform_prep/export/explain/explain_bundle.json
   ```
2. On the website: *Teacher → Admin → Import Explain cards*, then choose `explain_bundle.json`. Re-importing
   (e.g. after you edit the booklet) replaces the cards; students keep their read marks.


---

## Using it

**Teachers** (*Teacher* tab):
- *New class*: give the class a name and paste the students' school emails, one per line.
- *New assignment*: pick the class, title, due date, and whether answers are shown right after
  submitting or only after the due date. Filter by topic, subtopic, form or text, tick
  questions, or add random ones from the current filter.
- *Results*: shows each student's answer to each question (green is right, red is wrong), the
  percentage correct per question, and how many students chose each option. You can download a
  CSV.
- *Admin*: add or remove teachers, and import questions and Explain cards.
- *Explain reading*: for each class, how many Explain cards each student has marked read (total, last 7 days, last date).

**Students**:
- *Home* lists their assignments with due dates and scores.
- *Practise*: choose a topic, subtopic and number of questions. Questions in assignments that
  are still open are never given as practice, so practice can't be used to find assignment
  answers.
- *My results*: every past attempt, with a review page for each.
- *Explain*: the 134 Paper 1B explanation questions, each with the marking scheme, teaching notes and examiners'
  comments. Home shows a *card of the day* (the first unread card in the student's chosen topics; it stays the same all
  day). Students tick the topics they have learnt, can open any card, and tap *Mark as read*.

Each assignment can be submitted once. Late submissions are accepted and marked "late".
Unfinished answers are saved in the browser, so reloading the page doesn't lose them.

## Firestore layout

| Collection | Contents | Who can read |
|---|---|---|
| `questions/{id}` | text, options, figure file names, topic | anyone at school |
| `answerKeys/{id}` | `answer` | teachers |
| `teachers/{email}` | teacher list | teachers (and each person checking themselves) |
| `users/{uid}` | name, email, last login | the user, teachers |
| `classes/{id}` | name, `studentEmails` | teachers, students in the class |
| `classes/{id}/assignments/{id}` | title, `questionIds`, `dueAt`, `reveal` | teachers, students in the class |
| `attempts/{id}` | responses, score (written only by Cloud Functions) | the student, teachers |
| `meta/explainCards` | all Explain cards in one document | anyone at school |
| `explainProgress/{uid}` | a student's read marks, chosen topics, today's card | the student, teachers |
| `sessions/{id}` | practice sets (written only by Cloud Functions) | the student |

## Testing changes locally

`tests/run.mjs` drives the whole app (teacher and student flows, marking, and the rules
mirrored in `tests/fakes/rules.mjs`) against an in-memory Firebase. It doesn't need any
network access.

```bash
cd tests && npm install && node run.mjs
```

If you change `firestore.rules`, update `tests/fakes/rules.mjs` to match.
