import express from 'express';
import cors from 'cors';
import { dbConfigured, pool, checkDatabase } from './db.js';
import { jaccardSimilarity } from './similarity.js';

const app = express();
const port = Number(process.env.PORT || 5000);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const fail = (status, message, details) => Object.assign(new Error(message), { status, details });
const positiveId = (value, name = 'id') => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw fail(400, `${name} must be a positive integer.`);
  return parsed;
};
const score = (value, name) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10) throw fail(400, `${name} must be between 1 and 10.`);
  return parsed;
};
const requiredText = (value, name, max = 10000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw fail(400, `${name} is required and must be at most ${max} characters.`);
  return value.trim();
};
const email = (value) => {
  if (typeof value !== 'string' || !/^\S+@\S+\.\S+$/.test(value)) throw fail(400, 'A valid email is required.');
  return value.trim().toLowerCase();
};
const dbOnly = (handler) => asyncRoute(async (req, res, next) => {
  if (!dbConfigured) throw fail(503, 'Database is not configured. Copy backend/.env.example to backend/.env and enter the supplied credentials.');
  return handler(req, res, next);
});

app.get('/api/health', asyncRoute(async (_req, res) => {
  const database = await checkDatabase();
  res.status(database.healthy ? 200 : 503).json({ ok: database.healthy, backend: 'up', database: database.healthy ? 'healthy' : 'unavailable', error: database.error });
}));

app.get('/api/authors', dbOnly(async (_req, res) => { const [rows] = await pool.query('SELECT author_id, name, email, affiliation FROM Author ORDER BY name'); res.json(rows); }));
app.get('/api/reviewers', dbOnly(async (_req, res) => { const [rows] = await pool.query('SELECT reviewer_id, name, email, affiliation, expertise FROM Reviewer ORDER BY name'); res.json(rows); }));
app.get('/api/people', dbOnly(async (_req, res) => {
  const [[authors], [reviewers]] = await Promise.all([
    pool.query('SELECT author_id, name, email, affiliation FROM Author ORDER BY name'),
    pool.query('SELECT reviewer_id, name, email, affiliation, expertise FROM Reviewer ORDER BY name')
  ]);
  res.json({ authors, reviewers });
}));
app.post('/api/reviewers', dbOnly(async (req, res) => {
  const name = requiredText(req.body.name, 'name', 255);
  const reviewerEmail = email(req.body.email);
  const affiliation = typeof req.body.affiliation === 'string' ? req.body.affiliation.trim() : '';
  const expertise = typeof req.body.expertise === 'string' ? req.body.expertise.trim() : '';
  try {
    const [result] = await pool.execute('INSERT INTO Reviewer (name, email, affiliation, expertise) VALUES (?, ?, ?, ?)', [name, reviewerEmail, affiliation || null, expertise || null]);
    res.status(201).json({ reviewer_id: result.insertId, name, email: reviewerEmail, affiliation: affiliation || null, expertise: expertise || null, message: 'Reviewer added.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw fail(409, 'A reviewer with this email already exists.');
    throw error;
  }
}));

app.post('/api/submissions', dbOnly(async (req, res) => {
  const title = requiredText(req.body.title, 'title', 255);
  const abstract = requiredText(req.body.abstract, 'abstract', 50000);
  if (!Array.isArray(req.body.authors) || !req.body.authors.length) throw fail(400, 'At least one author is required.');
  const authors = req.body.authors.map((author) => ({ name: requiredText(author.name, 'author name', 255), email: email(author.email), affiliation: typeof author.affiliation === 'string' ? author.affiliation.trim() : '' }));
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [submission] = await connection.execute('INSERT INTO Submission (title, abstract, status) VALUES (?, ?, \'SUBMITTED\')', [title, abstract]);
    for (const author of authors) {
      const [existing] = await connection.execute('SELECT author_id FROM Author WHERE email = ?', [author.email]);
      let authorId = existing[0]?.author_id;
      if (!authorId) { const [created] = await connection.execute('INSERT INTO Author (name, email, affiliation) VALUES (?, ?, ?)', [author.name, author.email, author.affiliation || null]); authorId = created.insertId; }
      await connection.execute('INSERT INTO SubmissionAuthor (submission_id, author_id, author_order) VALUES (?, ?, ?)', [submission.insertId, authorId, authors.indexOf(author) + 1]);
    }
    const [previousSubmissions] = await connection.execute('SELECT submission_id, abstract FROM Submission WHERE submission_id <> ?', [submission.insertId]);
    for (const previous of previousSubmissions) {
      const similarity = jaccardSimilarity(abstract, previous.abstract);
      if (similarity >= 0.30) {
        await connection.execute('INSERT INTO SimilarityFlag (submission_id, compared_submission_id, similarity_score) VALUES (?, ?, ?)', [submission.insertId, previous.submission_id, similarity]);
      }
    }
    await connection.execute('INSERT INTO AuditLog (submission_id, action, details) VALUES (?, ?, ?)', [submission.insertId, 'SUBMISSION_CREATED', `Submission created: ${title}`]);
    await connection.commit();
    res.status(201).json({ submission_id: submission.insertId, message: 'Submission created.' });
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}));

app.get('/api/submissions', dbOnly(async (_req, res) => {
  const [rows] = await pool.query(`SELECT s.submission_id, s.title, s.status, s.created_at, ROUND(AVG(r.score), 2) AS average_score,
    EXISTS(SELECT 1 FROM SimilarityFlag sf WHERE sf.submission_id = s.submission_id) AS has_similarity_warning
    FROM Submission s LEFT JOIN ReviewAssignment ra ON ra.submission_id = s.submission_id LEFT JOIN Review r ON r.assignment_id = ra.assignment_id GROUP BY s.submission_id ORDER BY s.created_at DESC`);
  res.json(rows);
}));

app.get('/api/submissions/:id', dbOnly(async (req, res) => {
  const id = positiveId(req.params.id, 'submission_id');
  const [submissions] = await pool.execute('SELECT s.*, ROUND(AVG(r.score), 2) AS average_score FROM Submission s LEFT JOIN ReviewAssignment ra ON ra.submission_id=s.submission_id LEFT JOIN Review r ON r.assignment_id=ra.assignment_id WHERE s.submission_id=? GROUP BY s.submission_id', [id]);
  if (!submissions[0]) throw fail(404, 'Submission not found.');
  const [[authors], [reviews], [flags], [audit]] = await Promise.all([
    pool.execute('SELECT a.* FROM Author a JOIN SubmissionAuthor sa ON sa.author_id=a.author_id WHERE sa.submission_id=? ORDER BY sa.author_order', [id]),
    pool.execute('SELECT r.review_id, r.score, r.comments, r.submitted_at, rv.name AS reviewer_name, ra.assignment_id FROM Review r JOIN ReviewAssignment ra ON ra.assignment_id=r.assignment_id JOIN Reviewer rv ON rv.reviewer_id=ra.reviewer_id WHERE ra.submission_id=? ORDER BY r.submitted_at', [id]),
    pool.execute('SELECT sf.*, compared.title AS compared_submission_title FROM SimilarityFlag sf JOIN Submission compared ON compared.submission_id=sf.compared_submission_id WHERE sf.submission_id=? ORDER BY sf.similarity_score DESC', [id]),
    pool.execute('SELECT * FROM AuditLog WHERE submission_id=? ORDER BY created_at DESC', [id])
  ]);
  res.json({ ...submissions[0], authors, reviews, similarity_flags: flags, audit });
}));

app.post('/api/submissions/:id/assignments', dbOnly(async (req, res) => {
  const submissionId = positiveId(req.params.id, 'submission_id');
  const reviewerId = positiveId(req.body.reviewer_id, 'reviewer_id');
  const [submission] = await pool.execute('SELECT abstract, status FROM Submission WHERE submission_id=?', [submissionId]);
  if (!submission[0]) throw fail(404, 'Submission not found.');
  const [reviewer] = await pool.execute('SELECT email FROM Reviewer WHERE reviewer_id=?', [reviewerId]);
  if (!reviewer[0]) throw fail(404, 'Reviewer not found.');
  const [conflict] = await pool.execute('SELECT 1 FROM SubmissionAuthor sa JOIN Author a ON a.author_id=sa.author_id WHERE sa.submission_id=? AND LOWER(a.email)=LOWER(?)', [submissionId, reviewer[0].email]);
  if (conflict.length) throw fail(409, 'Conflict of interest: this reviewer is an author of the submission.');
  try { const [result] = await pool.execute('INSERT INTO ReviewAssignment (submission_id, reviewer_id) VALUES (?, ?)', [submissionId, reviewerId]); await pool.execute("UPDATE Submission SET status='UNDER_REVIEW' WHERE submission_id=? AND status='SUBMITTED'", [submissionId]); await pool.execute('INSERT INTO AuditLog (submission_id, action, details) VALUES (?, ?, ?)', [submissionId, 'REVIEWER_ASSIGNED', `Reviewer ${reviewerId} assigned.`]); res.status(201).json({ assignment_id: result.insertId, message: 'Reviewer assigned.' }); } catch (error) { if (error.code === 'ER_DUP_ENTRY') throw fail(409, 'This reviewer is already assigned.'); throw error; }
}));

app.get('/api/assignments', dbOnly(async (req, res) => { const params = []; let where = ''; if (req.query.reviewer_id) { params.push(positiveId(req.query.reviewer_id, 'reviewer_id')); where = 'WHERE ra.reviewer_id=?'; } const [rows] = await pool.execute(`SELECT ra.assignment_id, ra.submission_id, s.title, s.status, ra.reviewer_id, rv.name AS reviewer_name, r.review_id FROM ReviewAssignment ra JOIN Submission s ON s.submission_id=ra.submission_id JOIN Reviewer rv ON rv.reviewer_id=ra.reviewer_id LEFT JOIN Review r ON r.assignment_id=ra.assignment_id ${where} ORDER BY ra.assigned_at DESC`, params); res.json(rows); }));

app.post('/api/assignments/:id/review', dbOnly(async (req, res) => {
  const assignmentId = positiveId(req.params.id, 'assignment_id'); const reviewScore = score(req.body.score, 'score'); const comments = requiredText(req.body.comments, 'comments', 20000);
  const [assignment] = await pool.execute('SELECT ra.*, s.status FROM ReviewAssignment ra JOIN Submission s ON s.submission_id=ra.submission_id WHERE ra.assignment_id=?', [assignmentId]);
  if (!assignment[0]) throw fail(404, 'Assignment not found.'); if (assignment[0].status === 'ACCEPTED' || assignment[0].status === 'REJECTED') throw fail(409, 'Reviews cannot be modified after finalization.');
  try { const [result] = await pool.execute('INSERT INTO Review (assignment_id, score, comments) VALUES (?, ?, ?)', [assignmentId, reviewScore, comments]); await pool.execute('INSERT INTO AuditLog (submission_id, action, details) VALUES (?, ?, ?)', [assignment[0].submission_id, 'REVIEW_SUBMITTED', `Review submitted for assignment ${assignmentId}.`]); res.status(201).json({ review_id: result.insertId, message: 'Review submitted.' }); } catch (error) { if (error.code === 'ER_DUP_ENTRY') throw fail(409, 'This assignment already has a review.'); throw error; }
}));

app.post('/api/submissions/:id/finalize', dbOnly(async (req, res) => { const id = positiveId(req.params.id, 'submission_id'); try { const [result] = await pool.query('CALL FinalizeDecision(?)', [id]); res.json({ message: 'Decision finalized.', decision: result?.[0]?.[0]?.decision }); } catch (error) { if (error.sqlState === '45000') throw fail(409, error.sqlMessage); throw error; } }));
app.get('/api/submissions/:id/audit', dbOnly(async (req, res) => { const id = positiveId(req.params.id, 'submission_id'); const [rows] = await pool.execute('SELECT * FROM AuditLog WHERE submission_id=? ORDER BY created_at DESC', [id]); res.json(rows); }));

app.use((error, _req, res, _next) => { const status = error.status || (error.code === 'ER_NO_SUCH_TABLE' ? 503 : 500); console.error(error); res.status(status).json({ error: error.message || 'Internal server error.', details: error.details }); });
app.listen(port, () => console.log(`HybridRecall backend listening on http://localhost:${port}`));
