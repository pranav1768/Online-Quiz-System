// routes/admin.js - Admin-only routes
const express = require('express');
const bcrypt  = require('bcryptjs');
const { body, param, validationResult } = require('express-validator');
const db      = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All admin routes require authentication + admin role
router.use(authenticate, requireAdmin);

// =====================================================
// DASHBOARD
// =====================================================

// GET /api/admin/dashboard - Summary stats
router.get('/dashboard', async (req, res) => {
  try {
    const [[{ totalUsers }]]    = await db.query("SELECT COUNT(*) AS totalUsers FROM users WHERE role = 'student'");
    const [[{ totalQuizzes }]]  = await db.query('SELECT COUNT(*) AS totalQuizzes FROM quizzes');
    const [[{ totalAttempts }]] = await db.query("SELECT COUNT(*) AS totalAttempts FROM quiz_attempts WHERE status IN ('submitted','timed_out')");
    const [[{ avgScore }]]      = await db.query("SELECT ROUND(AVG(percentage),1) AS avgScore FROM quiz_attempts WHERE status IN ('submitted','timed_out')");

    const [recentAttempts] = await db.query(`
      SELECT qa.id, u.username, q.title AS quiz_title, qa.percentage, qa.status, qa.submitted_at
      FROM quiz_attempts qa
      JOIN users u  ON u.id  = qa.user_id
      JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.status IN ('submitted','timed_out')
      ORDER BY qa.submitted_at DESC
      LIMIT 10
    `);

    res.json({ success: true, stats: { totalUsers, totalQuizzes, totalAttempts, avgScore }, recentAttempts });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ success: false, message: 'Failed to load dashboard.' });
  }
});

// =====================================================
// QUIZ MANAGEMENT
// =====================================================

// GET /api/admin/quizzes - List all quizzes with stats
router.get('/quizzes', async (req, res) => {
  try {
    const [quizzes] = await db.query(`
      SELECT
        q.id, q.title, q.description, q.duration_minutes, q.passing_score, q.is_active, q.created_at,
        u.username AS created_by,
        COUNT(DISTINCT qs.id) AS question_count,
        COUNT(DISTINCT qa.id) AS attempt_count,
        ROUND(AVG(qa.percentage), 1) AS avg_score
      FROM quizzes q
      JOIN users u ON u.id = q.created_by
      LEFT JOIN questions qs ON qs.quiz_id = q.id
      LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id AND qa.status IN ('submitted','timed_out')
      GROUP BY q.id
      ORDER BY q.created_at DESC
    `);
    res.json({ success: true, quizzes });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch quizzes.' });
  }
});

// GET /api/admin/quizzes/:id - Full quiz detail with questions
router.get('/quizzes/:id', param('id').isInt(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Invalid quiz ID.' });

  try {
    const [[quiz]] = await db.query(
      'SELECT * FROM quizzes WHERE id = ? LIMIT 1',
      [req.params.id]
    );
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found.' });

    const [questions] = await db.query(`
      SELECT q.*, JSON_ARRAYAGG(
        JSON_OBJECT('id', o.id, 'text', o.option_text, 'is_correct', o.is_correct)
        ORDER BY o.id
      ) AS options
      FROM questions q
      JOIN options o ON o.question_id = q.id
      WHERE q.quiz_id = ?
      GROUP BY q.id
      ORDER BY q.order_num
    `, [req.params.id]);

    res.json({ success: true, quiz: { ...quiz, questions } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch quiz.' });
  }
});

// POST /api/admin/quizzes - Create new quiz with questions
router.post(
  '/quizzes',
  [
    body('title').trim().isLength({ min: 3, max: 200 }).withMessage('Title must be 3-200 chars'),
    body('duration_minutes').isInt({ min: 1, max: 180 }).withMessage('Duration 1-180 minutes'),
    body('passing_score').isInt({ min: 1, max: 100 }).withMessage('Passing score 1-100'),
    body('questions').isArray({ min: 1 }).withMessage('At least one question required'),
    body('questions.*.question_text').trim().notEmpty().withMessage('Question text required'),
    body('questions.*.options').isArray({ min: 2 }).withMessage('At least 2 options per question'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

    const { title, description, duration_minutes, passing_score, questions } = req.body;

    // Validate each question has exactly one correct answer
    for (let i = 0; i < questions.length; i++) {
      const correctCount = questions[i].options.filter(o => o.is_correct).length;
      if (correctCount !== 1) {
        return res.status(422).json({
          success: false,
          message: `Question ${i + 1}: must have exactly one correct answer.`,
        });
      }
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [quizResult] = await conn.query(
        `INSERT INTO quizzes (title, description, duration_minutes, passing_score, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [title, description || null, duration_minutes, passing_score, req.user.id]
      );
      const quizId = quizResult.insertId;

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const [qResult] = await conn.query(
          `INSERT INTO questions (quiz_id, question_text, question_type, points, order_num)
           VALUES (?, ?, ?, ?, ?)`,
          [quizId, q.question_text, q.question_type || 'mcq', q.points || 1, i + 1]
        );
        const questionId = qResult.insertId;

        for (const opt of q.options) {
          await conn.query(
            'INSERT INTO options (question_id, option_text, is_correct) VALUES (?, ?, ?)',
            [questionId, opt.text, opt.is_correct ? 1 : 0]
          );
        }
      }

      await conn.commit();
      res.status(201).json({ success: true, message: 'Quiz created successfully.', quizId });
    } catch (err) {
      await conn.rollback();
      console.error('Create quiz error:', err);
      res.status(500).json({ success: false, message: 'Failed to create quiz.' });
    } finally {
      conn.release();
    }
  }
);

// PATCH /api/admin/quizzes/:id/toggle - Toggle active status
router.patch('/quizzes/:id/toggle', param('id').isInt(), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT is_active FROM quizzes WHERE id = ? LIMIT 1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Quiz not found.' });

    const newStatus = rows[0].is_active ? 0 : 1;
    await db.query('UPDATE quizzes SET is_active = ? WHERE id = ?', [newStatus, req.params.id]);
    res.json({ success: true, is_active: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to toggle quiz.' });
  }
});

// DELETE /api/admin/quizzes/:id
router.delete('/quizzes/:id', param('id').isInt(), async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM quizzes WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Quiz not found.' });
    res.json({ success: true, message: 'Quiz deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete quiz.' });
  }
});

// =====================================================
// USER MANAGEMENT
// =====================================================

// GET /api/admin/users - List all users
router.get('/users', async (req, res) => {
  try {
    const [users] = await db.query(`
      SELECT u.id, u.username, u.email, u.role, u.is_active, u.created_at,
             COUNT(qa.id) AS total_attempts
      FROM users u
      LEFT JOIN quiz_attempts qa ON qa.user_id = u.id AND qa.status IN ('submitted','timed_out')
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
});

// PATCH /api/admin/users/:id/toggle - Enable/disable user
router.patch('/users/:id/toggle', param('id').isInt(), async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ success: false, message: 'Cannot disable your own account.' });
  }
  try {
    const [rows] = await db.query('SELECT is_active FROM users WHERE id = ? LIMIT 1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found.' });

    const newStatus = rows[0].is_active ? 0 : 1;
    await db.query('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, req.params.id]);
    res.json({ success: true, is_active: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to toggle user.' });
  }
});

// =====================================================
// RESULTS VIEW (Admin)
// =====================================================

// GET /api/admin/results - All attempt results with joins
router.get('/results', async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT
        qa.id, qa.score, qa.total_points, qa.percentage, qa.status,
        qa.started_at, qa.submitted_at,
        u.username, u.email,
        q.title AS quiz_title, q.passing_score,
        (qa.percentage >= q.passing_score) AS passed
      FROM quiz_attempts qa
      JOIN users u    ON u.id  = qa.user_id
      JOIN quizzes q  ON q.id  = qa.quiz_id
      WHERE qa.status IN ('submitted','timed_out')
      ORDER BY qa.submitted_at DESC
    `);
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch results.' });
  }
});

module.exports = router;
