# Online Quiz System
## Stack: HTML + CSS + JavaScript + Node.js + Express + MySQL

---

## Project Structure (Simple!)

```
quiz-simple/
│
├── database/
│   └── setup.sql          ← Run this in MySQL first
│
├── backend/
│   ├── server.js          ← The entire backend in ONE file
│   └── package.json
│
└── frontend/
    ├── index.html         ← Login / Register
    ├── dashboard.html     ← Student: see all quizzes
    ├── quiz.html          ← Student: take a quiz
    ├── result.html        ← Student: see score after quiz
    ├── my-results.html    ← Student: history of all attempts
    ├── css/style.css      ← All styles
    ├── js/app.js          ← Shared JS functions
    └── admin/
        ├── dashboard.html ← Admin: stats overview
        ├── quizzes.html   ← Admin: manage quizzes
        ├── create-quiz.html ← Admin: create new quiz
        ├── results.html   ← Admin: all student results
        └── users.html     ← Admin: all users
```

---

## Setup Steps

### Step 1 — Install MySQL
Download from: https://dev.mysql.com/downloads/installer/
- During install, set a root password (remember it!)

### Step 2 — Set up the database
1. Open MySQL Workbench
2. Connect to your local server
3. Open the file: `database/setup.sql`
4. Click the ⚡ Run button
5. This creates the database, tables, and a sample quiz

### Step 3 — Install Node.js
Download from: https://nodejs.org (choose LTS version)

### Step 4 — Set up the backend
```bash
cd backend
npm install
```
Then open `server.js` and change this line:
```js
password: 'your_mysql_password',   // ← put your MySQL password here
```

Then run:
```bash
npm run dev
```
You should see: ✅ Database connected!

### Step 5 — Run the frontend
1. Open VS Code
2. Install the "Live Server" extension
3. Right-click `frontend/index.html`
4. Click "Open with Live Server"
5. Opens at: http://127.0.0.1:5500/frontend/index.html

---

## Login Credentials

| Role    | Email              | Password |
|---------|--------------------|----------|
| Admin   | admin@quiz.com     | admin123 |
| Student | Register yourself! | —        |

---

## How it works (simple explanation)

1. **User logs in** → server checks password → gives back a TOKEN
2. **Token is saved** in browser (localStorage)
3. **Every request** sends that token → server checks it's valid
4. **Students** can see quizzes, take them, see their scores
5. **Admins** can create quizzes, view all results, see all users

---

## All Backend API Endpoints

| Method | URL | What it does |
|--------|-----|-------------|
| POST | /auth/register | Create account |
| POST | /auth/login | Login |
| GET  | /quizzes | List all quizzes |
| GET  | /quizzes/:id/questions | Get quiz questions |
| POST | /quizzes/:id/submit | Submit answers, get score |
| GET  | /my-results | My quiz history |
| GET  | /admin/dashboard | Admin stats |
| GET  | /admin/quizzes | All quizzes |
| POST | /admin/quizzes | Create quiz |
| DELETE | /admin/quizzes/:id | Delete quiz |
| GET  | /admin/results | All student results |
| GET  | /admin/users | All users |
