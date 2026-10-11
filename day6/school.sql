-- Enable foreign key support in SQLite
PRAGMA foreign_keys = ON;

-- Clean up existing tables for idempotent execution
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- ============================================================================
-- 1. Table Definitions
-- ============================================================================

-- Students table: stores student profile details
CREATE TABLE students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
);

-- Courses table: stores course offerings
CREATE TABLE courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL UNIQUE
);

-- Enrolments table: junction table linking students and courses with grades
CREATE TABLE enrolments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    grade TEXT,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    UNIQUE (student_id, course_id)
);

-- ============================================================================
-- 2. Sample Data
-- ============================================================================

-- Add at least 3 students (adding 4 to include a student with no enrolments)
INSERT INTO students (name, email) VALUES
    ('Alice Smith', 'alice@example.com'),
    ('Bob Jones', 'bob@example.com'),
    ('Charlie Brown', 'charlie@example.com'),
    ('Diana Prince', 'diana@example.com');

-- Add at least 3 courses
INSERT INTO courses (title) VALUES
    ('Web Development'),
    ('Database Systems'),
    ('Computer Networks');

-- Add at least 5 enrolments
INSERT INTO enrolments (student_id, course_id, grade) VALUES
    (1, 1, 'A'),   -- Alice in Web Development
    (1, 2, 'B+'),  -- Alice in Database Systems
    (2, 1, 'A-'),  -- Bob in Web Development
    (2, 3, 'B'),   -- Bob in Computer Networks
    (3, 2, 'C+');  -- Charlie in Database Systems

-- ============================================================================
-- 3. Required Queries
-- ============================================================================

-- Query 1: All courses for one student (by name)
SELECT courses.id AS course_id, courses.title AS course_title, enrolments.grade
FROM courses
JOIN enrolments ON courses.id = enrolments.course_id
JOIN students ON enrolments.student_id = students.id
WHERE students.name = 'Alice Smith';

-- Query 2: All students on one course
SELECT students.id AS student_id, students.name AS student_name, students.email, enrolments.grade
FROM students
JOIN enrolments ON students.id = enrolments.student_id
JOIN courses ON enrolments.course_id = courses.id
WHERE courses.title = 'Web Development';

-- Query 3: The number of students per course
SELECT courses.id AS course_id, courses.title AS course_title, COUNT(enrolments.student_id) AS student_count
FROM courses
LEFT JOIN enrolments ON courses.id = enrolments.course_id
GROUP BY courses.id, courses.title;

-- Query 4: Students who have no enrolments
SELECT students.id AS student_id, students.name AS student_name, students.email
FROM students
LEFT JOIN enrolments ON students.id = enrolments.student_id
WHERE enrolments.id IS NULL;

-- Query 5: An update of one enrolment's grade
UPDATE enrolments
SET grade = 'A+'
WHERE id = 1;
