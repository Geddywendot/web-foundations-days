# School Database Design

## 1. Table Explanations

The database schema models a school enrollment system using three normalized tables:

- **`students`**: Stores core information about individual students.
  - `id`: `INTEGER PRIMARY KEY AUTOINCREMENT` uniquely identifies each student record.
  - `name`: `TEXT NOT NULL` stores the student's full name.
  - `email`: `TEXT NOT NULL UNIQUE` stores the student's email address and enforces uniqueness to prevent duplicate student registrations.

- **`courses`**: Stores details about course offerings available at the school.
  - `id`: `INTEGER PRIMARY KEY AUTOINCREMENT` uniquely identifies each course.
  - `title`: `TEXT NOT NULL UNIQUE` stores the name of the course (e.g., "Web Development") and prevents redundant course entries.

- **`enrolments`**: Serves as the junction (associative) table that links students to the courses they take.
  - `id`: `INTEGER PRIMARY KEY AUTOINCREMENT` acts as the surrogate primary key for each enrolment record.
  - `student_id`: `INTEGER NOT NULL` references `students(id)` via a foreign key constraint (`ON DELETE CASCADE`), ensuring referential integrity.
  - `course_id`: `INTEGER NOT NULL` references `courses(id)` via a foreign key constraint (`ON DELETE CASCADE`).
  - `grade`: `TEXT` records the grade earned by the student in that specific course (e.g., 'A', 'B+'), which can be updated as the student completes coursework.
  - `UNIQUE (student_id, course_id)`: A composite unique constraint that enforces business logic by preventing the same student from enrolling in the same course more than once.

---

## 2. Relationships

### Many-to-Many Relationship
The relationship between **`students`** and **`courses`** is **many-to-many ($M:N$)**:
- A single student can enroll in multiple courses.
- A single course can be taken by multiple students.

### One-to-Many Relationships
In relational database design, a direct many-to-many relationship cannot be modeled cleanly within the two primary tables. Instead, the `enrolments` table decomposes the many-to-many relationship into two **one-to-many ($1:N$)** relationships:
1. **`students` to `enrolments` ($1:N$)**: One student can have zero, one, or many enrolment entries, but each enrolment entry belongs to exactly one student.
2. **`courses` to `enrolments` ($1:N$)**: One course can have zero, one, or many enrolment entries, but each enrolment entry belongs to exactly one course.

### Why a Join Table is Needed
A join table (also known as a bridge, junction, or associative table) is necessary for two fundamental reasons:
1. **Normalization and Scalability**: Without a join table, we would have to store comma-separated lists of course IDs in the `students` table (violating First Normal Form) or create multiple rigid columns such as `course_1`, `course_2`, etc. (which limits how many courses a student can take and wastes space with NULL values). A join table allows students and courses to grow independently without schema alterations.
2. **Holding Relationship-Specific Attributes**: The `grade` attribute does not belong solely to the student (a student does not have just one global grade) nor solely to the course (a course does not have just one grade). The grade is an attribute of the *interaction* between a specific student and a specific course. The `enrolments` join table provides the correct location to persist this relationship-specific data.

---

## 3. Recommended Index

### Index Definition
```sql
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);
```

### Reason
In the `enrolments` table, the composite constraint `UNIQUE (student_id, course_id)` automatically creates a B-tree index in SQLite where `student_id` is the leading (leftmost) column. While this composite index accelerates queries filtering or joining by `student_id`, B-tree composite indexes cannot be used efficiently when filtering or grouping by `course_id` alone due to the leftmost prefix rule. 

Queries such as finding all students on a given course (`WHERE courses.title = 'Web Development'`) or calculating the number of enrolled students per course (`GROUP BY courses.id`) must scan every row of the `enrolments` table to locate matching `course_id` values. Adding an explicit index on `enrolments(course_id)` allows the query planner to perform $O(\log N)$ index lookups instead of $O(N)$ full table scans, drastically speeding up course-centric lookups and joins as the school's enrolment records grow.

---

## 4. Architectural Choice: SQL vs. NoSQL

For this school management system, **SQL (a relational database)** is the superior architectural choice over NoSQL. The domain data is inherently relational, structured, and demands strict data integrity and transactional consistency (ACID guarantees). With SQL, foreign keys and unique constraints prevent critical real-world bugs such as orphaned course grades, duplicate student enrollments, or non-existent student registrations. School operations heavily rely on flexible querying, aggregations, and multi-entity joins—such as producing student transcripts, computing class grade averages, listing course rosters, and detecting unenrolled students—all of which are native, performant, and declarative in SQL. In contrast, a NoSQL document database would require either embedding course details within student documents (leading to severe data duplication, large document sizes, and update anomalies whenever a course name changes) or manually managing references without enforced foreign key integrity at the database layer. Because school management prioritizes high consistency, referential integrity, and complex relational reporting over high-volume unstructured writes, a relational SQL database is the right tool for the job.
