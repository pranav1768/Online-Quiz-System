-- ============================================================
-- ONLINE QUIZ SYSTEM - DATABASE SCHEMA
-- Relational design with normalization (3NF)
-- ============================================================

CREATE DATABASE IF NOT EXISTS quiz_system
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE quiz_system;

-- -------------------------------------------------------
-- TABLE: users
-- Stores all system users (students + admins)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INT           NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)   NOT NULL,
  email         VARCHAR(100)  NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  role          ENUM('student','admin') NOT NULL DEFAULT 'student',
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email    (email),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB;

-- -------------------------------------------------------
-- TABLE: quizzes
-- Stores quiz metadata
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS quizzes (
  id               INT           NOT NULL AUTO_INCREMENT,
  title            VARCHAR(200)  NOT NULL,
  description      TEXT,
  duration_minutes INT           NOT NULL DEFAULT 10
                                 COMMENT 'Server-controlled timer in minutes',
  passing_score    INT           NOT NULL DEFAULT 60
                                 COMMENT 'Minimum percentage to pass',
  created_by       INT           NOT NULL COMMENT 'FK -> users (admin)',
  is_active        TINYINT(1)    NOT NULL DEFAULT 1,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_quizzes_created_by
    FOREIGN KEY (created_by) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- -------------------------------------------------------
-- TABLE: questions
-- Each question belongs to one quiz (normalized)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS questions (
  id             INT          NOT NULL AUTO_INCREMENT,
  quiz_id        INT          NOT NULL,
  question_text  TEXT         NOT NULL,
  question_type  ENUM('mcq','true_false') NOT NULL DEFAULT 'mcq',
  points         INT          NOT NULL DEFAULT 1,
  order_num      INT          NOT NULL DEFAULT 1,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_questions_quiz
    FOREIGN KEY (quiz_id) REFERENCES quizzes (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- -------------------------------------------------------
-- TABLE: options
-- Answer choices per question (normalized, not stored inline)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS options (
  id           INT          NOT NULL AUTO_INCREMENT,
  question_id  INT          NOT NULL,
  option_text  VARCHAR(500) NOT NULL,
  is_correct   TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT fk_options_question
    FOREIGN KEY (question_id) REFERENCES questions (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- -------------------------------------------------------
-- TABLE: quiz_attempts
-- Records each student's attempt at a quiz
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id            INT          NOT NULL AUTO_INCREMENT,
  user_id       INT          NOT NULL,
  quiz_id       INT          NOT NULL,
  started_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at  DATETIME,
  time_limit_at DATETIME     NOT NULL COMMENT 'Server-enforced deadline',
  score         INT          NOT NULL DEFAULT 0,
  total_points  INT          NOT NULL DEFAULT 0,
  percentage    DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  status        ENUM('in_progress','submitted','timed_out') NOT NULL DEFAULT 'in_progress',
  PRIMARY KEY (id),
  CONSTRAINT fk_attempts_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_attempts_quiz
    FOREIGN KEY (quiz_id) REFERENCES quizzes (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  -- One active attempt per user per quiz
  UNIQUE KEY uq_active_attempt (user_id, quiz_id, status)
) ENGINE=InnoDB;

-- -------------------------------------------------------
-- TABLE: attempt_answers
-- Stores each answer submitted in an attempt
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS attempt_answers (
  id                INT      NOT NULL AUTO_INCREMENT,
  attempt_id        INT      NOT NULL,
  question_id       INT      NOT NULL,
  selected_option_id INT,
  is_correct        TINYINT(1) NOT NULL DEFAULT 0,
  points_earned     INT      NOT NULL DEFAULT 0,
  answered_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attempt_question (attempt_id, question_id),
  CONSTRAINT fk_answers_attempt
    FOREIGN KEY (attempt_id) REFERENCES quiz_attempts (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_answers_question
    FOREIGN KEY (question_id) REFERENCES questions (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_answers_option
    FOREIGN KEY (selected_option_id) REFERENCES options (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- SEED DATA - Default admin + sample quiz
-- ============================================================

-- Default Admin (password: Admin@123)
INSERT INTO users (username, email, password_hash, role) VALUES
  ('admin', 'admin@quizsystem.com',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGRdZJdcLvJjxQ3bJq4ZxKIYX.2', 'admin');

-- Sample Quiz
INSERT INTO quizzes (title, description, duration_minutes, passing_score, created_by) VALUES
  ('JavaScript Fundamentals',
   'Test your knowledge of core JavaScript concepts including variables, functions, and DOM.',
   10, 60, 1),
  ('Web Development Basics',
   'Covers HTML, CSS, and basic frontend concepts essential for every web developer.',
   15, 70, 1);

-- Questions for Quiz 1
INSERT INTO questions (quiz_id, question_text, question_type, points, order_num) VALUES
  (1, 'Which keyword is used to declare a block-scoped variable in JavaScript?', 'mcq', 1, 1),
  (1, 'What does the "===" operator check in JavaScript?', 'mcq', 1, 2),
  (1, 'JavaScript is a synchronous, single-threaded language.', 'true_false', 1, 3),
  (1, 'Which method is used to add an element at the end of an array?', 'mcq', 1, 4),
  (1, 'What will typeof null return in JavaScript?', 'mcq', 1, 5);

-- Options for Question 1
INSERT INTO options (question_id, option_text, is_correct) VALUES
  (1, 'var',  0), (1, 'let', 1), (1, 'const', 0), (1, 'block', 0);

-- Options for Question 2
INSERT INTO options (question_id, option_text, is_correct) VALUES
  (2, 'Value only', 0),
  (2, 'Type only',  0),
  (2, 'Value and Type', 1),
  (2, 'Reference', 0);

-- Options for Question 3 (true/false)
INSERT INTO options (question_id, option_text, is_correct) VALUES
  (3, 'True',  1),
  (3, 'False', 0);

-- Options for Question 4
INSERT INTO options (question_id, option_text, is_correct) VALUES
  (4, 'push()',   1),
  (4, 'append()', 0),
  (4, 'add()',    0),
  (4, 'insert()', 0);

-- Options for Question 5
INSERT INTO options (question_id, option_text, is_correct) VALUES
  (5, '"null"',   0),
  (5, '"object"', 1),
  (5, '"undefined"', 0),
  (5, '"number"', 0);

-- Questions for Quiz 2
INSERT INTO questions (quiz_id, question_text, question_type, points, order_num) VALUES
  (2, 'Which HTML tag is used to link an external CSS file?', 'mcq', 1, 1),
  (2, 'CSS stands for Cascading Style Sheets.', 'true_false', 1, 2),
  (2, 'Which CSS property controls the text size?', 'mcq', 1, 3);

INSERT INTO options (question_id, option_text, is_correct) VALUES
  (6, '<style>',  0), (6, '<link>',   1), (6, '<css>',  0), (6, '<script>',0);
INSERT INTO options (question_id, option_text, is_correct) VALUES
  (7, 'True', 1), (7, 'False', 0);
INSERT INTO options (question_id, option_text, is_correct) VALUES
  (8, 'font-size', 1), (8, 'text-size', 0), (8, 'font-style', 0), (8, 'text-weight', 0);
