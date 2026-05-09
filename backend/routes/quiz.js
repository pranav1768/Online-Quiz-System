// routes/quiz.js - Student-facing quiz routes
const express = require('express');
const { body, param, validationResult } = require('express-validator');
const db      = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All quiz routes require login
router.use(authenticate);

// -------------------------------------------------------
// GET /api/quizzes  - List all active quizzes
// -------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const [quizzes] = await db.query(`
      SELECT
        q.id,
        q.title,
        q.description,
        q.duration_minutes,
        q.passing_score,
        q.created_at,
        u.username AS created_by,
        COUNT(DISTINCT qs.id) AS question_count,
        -- Check if current user already has a completed attempt
        EXISTS (
          SELECT 1 FROM quiz_attempts qa
          WHERE qa.quiz_id = q.id
            AND qa.user_id = ?
            AND qa.status IN ('submitted', 'timed_out')
        ) AS already_attempted,
        -- Check if user has an in-progress attempt
        (
          SELECT qa2.id FROM quiz_attempts qa2
          WHERE qa2.quiz_id = q.id
            AND qa2.user_id = ?
            AND qa2.status = 'in_progress'
          LIMIT 1
        ) AS active_attempt_id
      FROM quizzes q
      JOIN users u ON u.id = q.created_by
      LEFT JOIN questions qs ON qs.quiz_id = q.id
      WHERE q.is_active = 1
      GROUP BY q.id
      ORDER BY q.created_at DESC
    `, [req.user.id, req.user.id]);

    res.json({ success: true, quizzes });
  } catch (err) {
    console.error('List quizzes error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch quizzes.' });
  }
});

// -------------------------------------------------------
// GET /api/quizzes/:id  - Get quiz info (no answers)
// -------------------------------------------------------
router.get('/:id', param('id').isInt(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Invalid quiz ID.' });

  try {
    const [rows] = await db.query(`
      SELECT q.id, q.title, q.description, q.duration_minutes, q.passing_score,
             u.username AS created_by, COUNT(DISTINCT qs.id) AS question_count
      FROM quizzes q
      JOIN users u ON u.id = q.created_by
      LEFT JOIN questions qs ON qs.quiz_id = q.id
      WHERE q.id = ? AND q.is_active = 1
      GROUP BY q.id
    `, [req.params.id]);

    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Quiz not found.' });

    res.json({ success: true, quiz: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch quiz.' });
  }
});

// -------------------------------------------------------
// POST /api/quizzes/:id/start  - Begin a quiz attempt
// -------------------------------------------------------
router.post('/:id/start', param('id').isInt(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Invalid quiz ID.' });

  const quizId = parseInt(req.params.id);
  const userId = req.user.id;

  try {
    // Fetch quiz
    const [quizRows] = await db.query(
      'SELECT id, duration_minutes FROM quizzes WHERE id = ? AND is_active = 1 LIMIT 1',
      [quizId]
    );
    if (quizRows.length === 0) return res.status(404).json({ success: false, message: 'Quiz not found.' });

    const quiz = quizRows[0];

    // Check for existing in-progress attempt
    const [existing] = await db.query(
      `SELECT id, started_at, time_limit_at FROM quiz_attempts
       WHERE user_id = ? AND quiz_id = ? AND status = 'in_progress' LIMIT 1`,
      [userId, quizId]
    );

    if (existing.length > 0) {
      // Resume existing attempt if not expired
      const attempt    = existing[0];
      const now        = new Date();
      const timeLimit  = new Date(attempt.time_limit_at);

      if (now > timeLimit) {
        // Auto-submit expired attempt
        await db.query(
          `UPDATE quiz_attempts SET status = 'timed_out', submitted_at = NOW() WHERE id = ?`,
          [attempt.id]
        );
        // Recalculate score for timed-out
        await calculateScore(attempt.id);
        return res.status(410).json({ success: false, message: 'Your previous attempt has timed out.' });
      }

      // Return existing attempt
      const [questions] = await getQuestionsForAttempt(quizId);
      return res.json({
        success: true,
        attemptId: attempt.id,
        timeLimitAt: attempt.time_limit_at,
        questions,
        resumed: true,
      });
    }

    // Check if already completed
    const [completed] = await db.query(
      `SELECT id FROM quiz_attempts
       WHERE user_id = ? AND quiz_id = ? AND status IN ('submitted', 'timed_out') LIMIT 1`,
      [userId, quizId]
    );
    if (completed.length > 0) {
      return res.status(409).json({ success: false, message: 'You have already completed this quiz.' });
    }

    // Create new attempt with server-controlled time limit
    const timeLimitAt = new Date(Date.now() + quiz.duration_minutes * 60 * 1000);

    const [result] = await db.query(
      `INSERT INTO quiz_attempts (user_id, quiz_id, time_limit_at, status)
       VALUES (?, ?, ?, 'in_progress')`,
      [userId, quizId, timeLimitAt]
    );

    const [questions] = await getQuestionsForAttempt(quizId);

    // Calculate total points for this attempt
    const totalPoints = questions.reduce((sum, q) => sum + q.points, 0);
    await db.query('UPDATE quiz_attempts SET total_points = ? WHERE id = ?', [totalPoints, result.insertId]);

    res.status(201).json({
      success: true,
      attemptId: result.insertId,
      timeLimitAt,
      questions,
      resumed: false,
    });
  } catch (err) {
    console.error('Start quiz error:', err);
    res.status(500).json({ success: false, message: 'Failed to start quiz.' });
  }
});

// -------------------------------------------------------
// POST /api/quizzes/attempts/:attemptId/answer
// Save a single answer (auto-save support)
// -------------------------------------------------------
router.post(
  '/attempts/:attemptId/answer',
  [
    param('attemptId').isInt(),
    body('questionId').isInt(),
    body('optionId').isInt(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

    const { attemptId } = req.params;
    const { questionId, optionId } = req.body;

    try {
      // Validate attempt belongs to user and is in-progress
      const [attempts] = await db.query(
        `SELECT id, time_limit_at FROM quiz_attempts
         WHERE id = ? AND user_id = ? AND status = 'in_progress' LIMIT 1`,
        [attemptId, req.user.id]
      );
      if (attempts.length === 0) {
        return res.status(403).json({ success: false, message: 'Attempt not found or already submitted.' });
      }

      // Check time limit
      if (new Date() > new Date(attempts[0].time_limit_at)) {
        await db.query(
          `UPDATE quiz_attempts SET status = 'timed_out', submitted_at = NOW() WHERE id = ?`,
          [attemptId]
        );
        await calculateScore(attemptId);
        return res.status(410).json({ success: false, message: 'Time is up! Quiz auto-submitted.' });
      }

      // Validate option belongs to question
      const [optionRows] = await db.query(
        'SELECT id, is_correct, question_id FROM options WHERE id = ? AND question_id = ? LIMIT 1',
        [optionId, questionId]
      );
      if (optionRows.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid option for this question.' });
      }

      const option = optionRows[0];
      const [qRows] = await db.query('SELECT points FROM questions WHERE id = ? LIMIT 1', [questionId]);
      const pointsEarned = option.is_correct ? qRows[0].points : 0;

      // Upsert answer (UPDATE if already answered, INSERT if not)
      await db.query(
        `INSERT INTO attempt_answers (attempt_id, question_id, selected_option_id, is_correct, points_earned)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           selected_option_id = VALUES(selected_option_id),
           is_correct         = VALUES(is_correct),
           points_earned      = VALUES(points_earned),
           answered_at        = NOW()`,
        [attemptId, questionId, optionId, option.is_correct, pointsEarned]
      );

      res.json({ success: true, message: 'Answer saved.' });
    } catch (err) {
      console.error('Save answer error:', err);
      res.status(500).json({ success: false, message: 'Failed to save answer.' });
    }
  }
);

// -------------------------------------------------------
// POST /api/quizzes/attempts/:attemptId/submit
// Final submission
// -------------------------------------------------------
router.post('/attempts/:attemptId/submit', param('attemptId').isInt(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Invalid attempt ID.' });

  const { attemptId } = req.params;

  try {
    const [attempts] = await db.query(
      `SELECT id, quiz_id, time_limit_at FROM quiz_attempts
       WHERE id = ? AND user_id = ? AND status = 'in_progress' LIMIT 1`,
      [attemptId, req.user.id]
    );
    if (attempts.length === 0) {
      return res.status(403).json({ success: false, message: 'Attempt not found or already submitted.' });
    }

    const status = new Date() > new Date(attempts[0].time_limit_at) ? 'timed_out' : 'submitted';

    await db.query(
      `UPDATE quiz_attempts SET status = ?, submitted_at = NOW() WHERE id = ?`,
      [status, attemptId]
    );

    const result = await calculateScore(attemptId);

    res.json({ success: true, message: 'Quiz submitted successfully.', result });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ success: false, message: 'Failed to submit quiz.' });
  }
});

// -------------------------------------------------------
// GET /api/quizzes/results/:attemptId  - Get result
// -------------------------------------------------------
router.get('/results/:attemptId', param('attemptId').isInt(), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Invalid attempt ID.' });

  try {
    const [attempts] = await db.query(`
      SELECT qa.id, qa.score, qa.total_points, qa.percentage, qa.status,
             qa.started_at, qa.submitted_at, qa.time_limit_at,
             q.title AS quiz_title, q.description AS quiz_description, q.passing_score
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.id = ? AND qa.user_id = ?
      LIMIT 1
    `, [req.params.attemptId, req.user.id]);

    if (attempts.length === 0) return res.status(404).json({ success: false, message: 'Result not found.' });

    const attempt = attempts[0];

    // Fetch detailed answers with correct options
    const [answers] = await db.query(`
      SELECT
        qs.question_text,
        qs.points,
        o_selected.option_text AS selected_answer,
        aa.is_correct,
        aa.points_earned,
        o_correct.option_text  AS correct_answer
      FROM attempt_answers aa
      JOIN questions qs ON qs.id = aa.question_id
      LEFT JOIN options o_selected ON o_selected.id = aa.selected_option_id
      JOIN options o_correct ON o_correct.question_id = qs.id AND o_correct.is_correct = 1
      WHERE aa.attempt_id = ?
      ORDER BY qs.order_num
    `, [req.params.attemptId]);

    res.json({
      success: true,
      attempt: {
        ...attempt,
        passed: attempt.percentage >= attempt.passing_score,
      },
      answers,
    });
  } catch (err) {
    console.error('Get result error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch result.' });
  }
});

// -------------------------------------------------------
// GET /api/quizzes/my-results  - Student's history
// -------------------------------------------------------
router.get('/my/results', async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT qa.id, qa.score, qa.total_points, qa.percentage, qa.status,
             qa.started_at, qa.submitted_at,
             q.title AS quiz_title, q.passing_score,
             (qa.percentage >= q.passing_score) AS passed
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.user_id = ? AND qa.status IN ('submitted', 'timed_out')
      ORDER BY qa.submitted_at DESC
    `, [req.user.id]);

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch results.' });
  }
});

// -------------------------------------------------------
// Helper: Get questions with options (NO correct flag)
// -------------------------------------------------------
async function getQuestionsForAttempt(quizId) {
  return db.query(`
    SELECT
      q.id,
      q.question_text,
      q.question_type,
      q.points,
      q.order_num,
      JSON_ARRAYAGG(
        JSON_OBJECT('id', o.id, 'text', o.option_text)
        ORDER BY o.id
      ) AS options
    FROM questions q
    JOIN options o ON o.question_id = q.id
    WHERE q.quiz_id = ?
    GROUP BY q.id
    ORDER BY q.order_num
  `, [quizId]);
}

// -------------------------------------------------------
// Helper: Calculate and persist score for an attempt
// -------------------------------------------------------
async function calculateScore(attemptId) {
  const [[{ score }]] = await db.query(
    'SELECT COALESCE(SUM(points_earned), 0) AS score FROM attempt_answers WHERE attempt_id = ?',
    [attemptId]
  );

  const [[attempt]] = await db.query(
    'SELECT total_points FROM quiz_attempts WHERE id = ? LIMIT 1',
    [attemptId]
  );

  const totalPoints = attempt.total_points || 1;
  const percentage  = parseFloat(((score / totalPoints) * 100).toFixed(2));

  await db.query(
    'UPDATE quiz_attempts SET score = ?, percentage = ? WHERE id = ?',
    [score, percentage, attemptId]
  );

  return { score, totalPoints, percentage };
}

module.exports = router;
