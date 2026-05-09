# 🎓 Online Quiz System
### Internship Project — Full Stack Web Application
**Stack:** HTML · CSS · JavaScript · Node.js · Express.js · MySQL

---

## 📁 Project Structure

```
online-quiz-system/
├── backend/
│   ├── config/
│   │   └── db.js              # MySQL connection pool
│   ├── middleware/
│   │   └── auth.js            # JWT authentication + admin guard
│   ├── routes/
│   │   ├── auth.js            # Register, Login, /me
│   │   ├── quiz.js            # Student: list, start, answer, submit, results
│   │   └── admin.js           # Admin: dashboard, CRUD quizzes, users, results
│   ├── server.js              # Express app entry point
│   ├── package.json
│   └── .env.example           # ← copy to .env and fill in
│
├── frontend/
│   ├── css/
│   │   └── style.css          # Dark theme, all styles
│   ├── js/
│   │   └── utils.js           # API client, Auth helpers, Toast, helpers
│   ├── admin/
│   │   ├── dashboard.html     # Admin overview + recent submissions
│   │   ├── quizzes.html       # Quiz list with toggle/delete
│   │   ├── create-quiz.html   # Dynamic quiz builder (MCQ + True/False)
│   │   ├── users.html         # User management
│   │   └── results.html       # All results with filters
│   ├── index.html             # Login + Register
│   ├── dashboard.html         # Student quiz list
│   ├── quiz.html              # Take quiz (timer + auto-save)
│   ├── results.html           # Individual result + answer review
│   └── my-results.html        # Student history
│
└── database/
    └── schema.sql             # Full schema + seed data
```

---

## ⚙️ Setup Instructions

### Step 1: Database Setup

1. Open MySQL Workbench or your MySQL terminal
2. Run the schema file:
```sql
source /path/to/online-quiz-system/database/schema.sql;
```
This will:
- Create the `quiz_system` database
- Create all 6 normalized tables
- Insert the default admin user
- Insert 2 sample quizzes with questions

**Default Admin Credentials:**
- Email: `admin@quizsystem.com`
- Password: `Admin@123`

---

### Step 2: Backend Setup

```bash
cd online-quiz-system/backend

# Copy environment file
cp .env.example .env

# Edit .env with your MySQL credentials
nano .env   # or use any text editor

# Install dependencies
npm install

# Start the server
npm run dev       # development (with nodemon auto-reload)
# OR
npm start         # production
```

Your backend will run at: `http://localhost:5000`

**Required `.env` values:**
```
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=quiz_system
JWT_SECRET=any_long_random_string_here
JWT_EXPIRES_IN=24h
FRONTEND_URL=http://127.0.0.1:5500
```

---

### Step 3: Frontend Setup

The frontend is plain HTML/CSS/JS — **no build step needed**.

**Option A: VS Code Live Server (Recommended)**
1. Open the `online-quiz-system/` folder in VS Code
2. Install the "Live Server" extension
3. Right-click `frontend/index.html` → "Open with Live Server"
4. It will open at `http://127.0.0.1:5500/frontend/index.html`

**Option B: Python HTTP Server**
```bash
cd online-quiz-system
python3 -m http.server 5500
# Open: http://localhost:5500/frontend/index.html
```

> ⚠️ **Important:** The frontend must run at `http://127.0.0.1:5500` (or update `FRONTEND_URL` in `.env` to match your port). This is required for CORS to work.

---

## 🚀 Features Implemented

### ✅ Server-Controlled Timed Quizzes
- Timer set on server at quiz start (`time_limit_at` stored in DB)
- Frontend shows countdown but server validates on every answer save
- Auto-submits when time expires (status → `timed_out`)
- Resuming a quiz uses the original server-side deadline

### ✅ Secure Question & Answer Storage
- Correct answers (`is_correct`) are **never sent to the frontend** during a quiz
- Only revealed in results after submission
- Answers validated server-side on every save
- JWT authentication required for all quiz routes

### ✅ Score Calculation & Result Persistence
- Per-question points tracked in `attempt_answers`
- Score calculated server-side at submission time
- Percentage, pass/fail status persisted in `quiz_attempts`
- Complete answer review shown in results page

### ✅ Relational Database Design with Normalization
- 6 tables in Third Normal Form (3NF)
- Foreign keys with CASCADE rules
- `UNIQUE` constraints to prevent duplicate attempts
- Connection pool for scalable concurrent access

### ✅ SQL Queries with Joins and Constraints
- Dashboard query: JOINs across 4 tables
- Results query with conditional `EXISTS` subquery
- `ON DUPLICATE KEY UPDATE` for answer upserts
- Transaction used for quiz creation (atomic insert of quiz + questions + options)

### ✅ Admin-Level Quiz Management
- Create quizzes with dynamic question builder
- MCQ and True/False question types
- Toggle quiz active/inactive
- Delete quiz (cascades to all questions, options, attempts)
- View all student results with filters
- Enable/disable student accounts

### ✅ Robust Error Handling & Validation
- Input validation with `express-validator` on all POST routes
- Global error handler middleware
- Rate limiting on auth routes (20 req/15min)
- General rate limiting (100 req/min)
- Security headers via `helmet`
- bcrypt (cost 12) for password hashing
- JWT expiry handling with redirect

---

## 🔗 API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create student account |
| POST | `/api/auth/login` | Login, returns JWT |
| GET  | `/api/auth/me` | Get current user info |

### Student Quiz
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/quizzes` | List active quizzes |
| GET  | `/api/quizzes/:id` | Quiz info |
| POST | `/api/quizzes/:id/start` | Start/resume attempt |
| POST | `/api/quizzes/attempts/:id/answer` | Auto-save answer |
| POST | `/api/quizzes/attempts/:id/submit` | Final submission |
| GET  | `/api/quizzes/results/:id` | Get attempt result |
| GET  | `/api/quizzes/my/results` | My results history |

### Admin (requires admin role)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/admin/dashboard` | Stats + recent activity |
| GET  | `/api/admin/quizzes` | All quizzes with stats |
| POST | `/api/admin/quizzes` | Create quiz |
| PATCH | `/api/admin/quizzes/:id/toggle` | Toggle active |
| DELETE | `/api/admin/quizzes/:id` | Delete quiz |
| GET  | `/api/admin/users` | All users |
| PATCH | `/api/admin/users/:id/toggle` | Enable/disable user |
| GET  | `/api/admin/results` | All results |

---

## 🛡️ Security Features
- **JWT** with 24h expiry for stateless auth
- **bcrypt** (cost factor 12) for password hashing
- **Helmet.js** for security headers (XSS, CSP, etc.)
- **Rate limiting** on auth routes (brute-force protection)
- **Input validation** with express-validator
- **CORS** restricted to frontend origin
- **Role-based access control** (student vs admin)
- **Server-side time enforcement** for quiz timers

---

## 📝 Notes for Internship Presentation

1. **Scalable Architecture**: Connection pooling (10 connections), stateless JWT auth, modular routes
2. **Separation of Concerns**: Config, middleware, routes are all separate modules
3. **Database Normalization**: All tables in 3NF — no redundant data
4. **Transaction Safety**: Quiz creation uses SQL transactions for atomicity
5. **Security First**: Passwords hashed, answers hidden, time enforced server-side
