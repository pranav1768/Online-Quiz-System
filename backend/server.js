// ============================================================
//  Online Quiz System — Backend Server
//  Simple, easy to understand code
// ============================================================

const express = require('express');
const mysql   = require('mysql2/promise');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const cors    = require('cors');

const app = express();

// ── Settings ─────────────────────────────────────────────────
const PORT       = 5000;
const JWT_SECRET = 'my_quiz_secret_key_123'; // change this in real projects

// ── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: '*' }));         // allow all origins (for development)
app.use(express.json());                // parse JSON request body

// ── Database Connection ───────────────────────────────────────
const db = mysql.createPool({
  host:     'localhost',
  user:     'root',
  password: 'your_mysql_password',    // ← change this
  database: 'quiz_db',
});

// Test database connection on startup
db.getConnection()
  .then(() => console.log('✅ Database connected!'))
  .catch(err => console.error('❌ Database error:', err.message));

// ============================================================
//  HELPER FUNCTIONS
// ============================================================

// Check if the user is logged in (verify JWT token)
function checkLogin(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Please login first.' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user; // attach user info to request
    next();
  } catch {
    return res.status(401).json({ message: 'Login expired. Please login again.' });
  }
}

// Check if the user is an admin
function checkAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access only.' });
  }
  next();
}

// ============================================================
//  AUTH ROUTES (Login & Register)
// ============================================================

// POST /auth/register — Create a new student account
app.post('/auth/register', async (req, res) => {
  const { name, email, password } = req.body;

  // Basic validation
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }

  try {
    // Check if email already used
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Email already registered.' });
    }

    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save user to database
    const [result] = await db.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, 'student']
    );

    res.json({ message: 'Account created! You can now login.', userId: result.insertId });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Try again.' });
  }
});

// POST /auth/login — Login and get a token
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    // Find user by email
    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
      return res.status(400).json({ message: 'Wrong email or password.' });
    }

    const user = users[0];

    // Check password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(400).json({ message: 'Wrong email or password.' });
    }

    // Create a token (expires in 24 hours)
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful!',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Try again.' });
  }
});

// ============================================================
//  QUIZ ROUTES (for students)
// ============================================================

// GET /quizzes — Get all quizzes
app.get('/quizzes', checkLogin, async (req, res) => {
  try {
    const [quizzes] = await db.query(`
      SELECT 
        q.id, q.title, q.description, q.time_limit, q.pass_mark,
        COUNT(qs.id) AS total_questions
      FROM quizzes q
      LEFT JOIN questions qs ON qs.quiz_id = q.id
      GROUP BY q.id
    `);

    res.json({ quizzes });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load quizzes.' });
  }
});

// GET /quizzes/:id/questions — Get questions for a quiz (no correct answers!)
app.get('/quizzes/:id/questions', checkLogin, async (req, res) => {
  const quizId = req.params.id;

  try {
    // Check if quiz exists
    const [quizRows] = await db.query('SELECT * FROM quizzes WHERE id = ?', [quizId]);
    if (quizRows.length === 0) {
      return res.status(404).json({ message: 'Quiz not found.' });
    }

    // Get questions WITHOUT the correct answer (for security)
    const [questions] = await db.query(
      'SELECT id, question, option_a, option_b, option_c, option_d FROM questions WHERE quiz_id = ?',
      [quizId]
    );

    res.json({
      quiz: quizRows[0],
      questions
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load questions.' });
  }
});

// POST /quizzes/:id/submit — Submit quiz answers and get score
app.post('/quizzes/:id/submit', checkLogin, async (req, res) => {
  const quizId  = req.params.id;
  const userId  = req.user.id;
  const answers = req.body.answers; // { questionId: "A", questionId: "B", ... }

  if (!answers) {
    return res.status(400).json({ message: 'Answers are required.' });
  }

  try {
    // Get quiz info
    const [quizRows] = await db.query('SELECT * FROM quizzes WHERE id = ?', [quizId]);
    if (quizRows.length === 0) {
      return res.status(404).json({ message: 'Quiz not found.' });
    }
    const quiz = quizRows[0];

    // Get all questions WITH correct answers (server-side only)
    const [questions] = await db.query(
      'SELECT id, correct_ans FROM questions WHERE quiz_id = ?',
      [quizId]
    );

    // Calculate score
    let score = 0;
    const questionResults = questions.map(q => {
      const userAnswer    = answers[q.id];
      const isCorrect     = userAnswer === q.correct_ans;
      if (isCorrect) score++;
      return { questionId: q.id, correct: isCorrect };
    });

    const total   = questions.length;
    const percent = total > 0 ? ((score / total) * 100).toFixed(2) : 0;
    const passed  = percent >= quiz.pass_mark ? 1 : 0;

    // Save result to database
    await db.query(
      'INSERT INTO results (user_id, quiz_id, score, total, percent, passed) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, quizId, score, total, percent, passed]
    );

    res.json({
      message: 'Quiz submitted!',
      score,
      total,
      percent: parseFloat(percent),
      passed: passed === 1,
      passMark: quiz.pass_mark,
      details: questionResults
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not submit quiz.' });
  }
});

// GET /my-results — Get current user's quiz history
app.get('/my-results', checkLogin, async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT 
        r.id, r.score, r.total, r.percent, r.passed, r.taken_at,
        q.title AS quiz_title, q.pass_mark
      FROM results r
      JOIN quizzes q ON q.id = r.quiz_id
      WHERE r.user_id = ?
      ORDER BY r.taken_at DESC
    `, [req.user.id]);

    res.json({ results });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load results.' });
  }
});

// ============================================================
//  ADMIN ROUTES (only for admin users)
// ============================================================

// GET /admin/dashboard — Summary stats
app.get('/admin/dashboard', checkLogin, checkAdmin, async (req, res) => {
  try {
    const [[{ totalStudents }]] = await db.query("SELECT COUNT(*) AS totalStudents FROM users WHERE role = 'student'");
    const [[{ totalQuizzes  }]] = await db.query('SELECT COUNT(*) AS totalQuizzes FROM quizzes');
    const [[{ totalAttempts }]] = await db.query('SELECT COUNT(*) AS totalAttempts FROM results');
    const [[{ avgScore      }]] = await db.query('SELECT ROUND(AVG(percent), 1) AS avgScore FROM results');

    // Recent results
    const [recentResults] = await db.query(`
      SELECT r.id, u.name, q.title, r.percent, r.passed, r.taken_at
      FROM results r
      JOIN users   u ON u.id = r.user_id
      JOIN quizzes q ON q.id = r.quiz_id
      ORDER BY r.taken_at DESC
      LIMIT 10
    `);

    res.json({ totalStudents, totalQuizzes, totalAttempts, avgScore, recentResults });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not load dashboard.' });
  }
});

// GET /admin/quizzes — Get all quizzes with question count
app.get('/admin/quizzes', checkLogin, checkAdmin, async (req, res) => {
  try {
    const [quizzes] = await db.query(`
      SELECT q.*, COUNT(qs.id) AS total_questions
      FROM quizzes q
      LEFT JOIN questions qs ON qs.quiz_id = q.id
      GROUP BY q.id
      ORDER BY q.id DESC
    `);
    res.json({ quizzes });
  } catch (error) {
    res.status(500).json({ message: 'Could not load quizzes.' });
  }
});

// POST /admin/quizzes — Create a new quiz with questions
app.post('/admin/quizzes', checkLogin, checkAdmin, async (req, res) => {
  const { title, description, time_limit, pass_mark, questions } = req.body;

  if (!title || !questions || questions.length === 0) {
    return res.status(400).json({ message: 'Title and at least one question are required.' });
  }

  try {
    // Save the quiz
    const [quizResult] = await db.query(
      'INSERT INTO quizzes (title, description, time_limit, pass_mark) VALUES (?, ?, ?, ?)',
      [title, description || '', time_limit || 10, pass_mark || 60]
    );
    const quizId = quizResult.insertId;

    // Save each question
    for (const q of questions) {
      await db.query(
        'INSERT INTO questions (quiz_id, question, option_a, option_b, option_c, option_d, correct_ans) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [quizId, q.question, q.option_a, q.option_b, q.option_c || null, q.option_d || null, q.correct_ans]
      );
    }

    res.json({ message: 'Quiz created successfully!', quizId });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Could not create quiz.' });
  }
});

// DELETE /admin/quizzes/:id — Delete a quiz
app.delete('/admin/quizzes/:id', checkLogin, checkAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM quizzes WHERE id = ?', [req.params.id]);
    res.json({ message: 'Quiz deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Could not delete quiz.' });
  }
});

// GET /admin/results — All student results
app.get('/admin/results', checkLogin, checkAdmin, async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT r.id, u.name, u.email, q.title, r.score, r.total, r.percent, r.passed, r.taken_at
      FROM results r
      JOIN users   u ON u.id = r.user_id
      JOIN quizzes q ON q.id = r.quiz_id
      ORDER BY r.taken_at DESC
    `);
    res.json({ results });
  } catch (error) {
    res.status(500).json({ message: 'Could not load results.' });
  }
});

// GET /admin/users — All users
app.get('/admin/users', checkLogin, checkAdmin, async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, name, email, role FROM users ORDER BY id DESC'
    );
    res.json({ users });
  } catch (error) {
    res.status(500).json({ message: 'Could not load users.' });
  }
});

// GET /admin/quizzes/:id/questions — Get quiz questions WITH answers (admin only)
app.get('/admin/quizzes/:id/questions', checkLogin, checkAdmin, async (req, res) => {
  try {
    const [questions] = await db.query(
      'SELECT * FROM questions WHERE quiz_id = ?',
      [req.params.id]
    );
    res.json({ questions });
  } catch (error) {
    res.status(500).json({ message: 'Could not load questions.' });
  }
});

// ── Health Check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'Server is running!' });
});

// ── Start Server ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`📋 Login: POST http://localhost:${PORT}/auth/login`);
  console.log(`📝 Quizzes: GET http://localhost:${PORT}/quizzes\n`);
});
   