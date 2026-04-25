-- Run this file in MySQL Workbench to set up the database 

CREATE DATABASE IF NOT EXISTS quiz_db;
USE quiz_db;

-- Table 1: Users (students and admins)
CREATE TABLE users (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  name     VARCHAR(100) NOT NULL,
  email    VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role     VARCHAR(10)  NOT NULL DEFAULT 'student'
);

-- Table 2: Quizzes
CREATE TABLE quizzes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  time_limit  INT NOT NULL DEFAULT 10,
  pass_mark   INT NOT NULL DEFAULT 60
);

-- Table 3: Questions
CREATE TABLE questions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  quiz_id      INT NOT NULL,
  question     TEXT NOT NULL,
  option_a     VARCHAR(300) NOT NULL,
  option_b     VARCHAR(300) NOT NULL,
  option_c     VARCHAR(300),
  option_d     VARCHAR(300),
  correct_ans  VARCHAR(1) NOT NULL,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

-- Table 4: Results
CREATE TABLE results (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  quiz_id    INT NOT NULL,
  score      INT NOT NULL DEFAULT 0,
  total      INT NOT NULL DEFAULT 0,
  percent    DECIMAL(5,2) NOT NULL DEFAULT 0,
  passed     TINYINT(1) NOT NULL DEFAULT 0,
  taken_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

-- Default admin account  (password: admin123)
INSERT INTO users (name, email, password, role) VALUES
('Admin', 'admin@quiz.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');

-- Sample quiz
INSERT INTO quizzes (title, description, time_limit, pass_mark) VALUES
('JavaScript Basics', 'A simple quiz on JavaScript fundamentals.', 10, 60);

-- Sample questions
INSERT INTO questions (quiz_id, question, option_a, option_b, option_c, option_d, correct_ans) VALUES
(1, 'Which keyword declares a variable in JavaScript?', 'var', 'int', 'dim', 'define', 'A'),
(1, 'What does === check?', 'Value only', 'Type only', 'Value and Type', 'Neither', 'C'),
(1, 'Which method adds to the end of an array?', 'push()', 'pop()', 'shift()', 'add()', 'A'),
(1, 'What does typeof null return?', 'null', 'undefined', 'object', 'number', 'C'),
(1, 'Which is NOT a JavaScript data type?', 'String', 'Boolean', 'Integer', 'Number', 'C');
 