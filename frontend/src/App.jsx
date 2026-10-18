import { useEffect, useState } from 'react';

const api = async (path, options = {}) => {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
};

const demoReviewers = [
  { reviewer_id: 1, name: 'Dr. Alan Turing', expertise: 'Artificial intelligence' },
  { reviewer_id: 2, name: 'Dr. Katherine Johnson', expertise: 'Data analysis' }
];
const demoSubmissions = [
  { submission_id: 101, title: 'Human-Centered Evaluation of Retrieval Systems', status: 'UNDER_REVIEW', average_score: 8.2, has_similarity_warning: false },
  { submission_id: 102, title: 'Reliable Workflows for Reproducible Research', status: 'SUBMITTED', average_score: null, has_similarity_warning: true }
];
const demoAssignments = [
  { assignment_id: 201, submission_id: 101, title: demoSubmissions[0].title, reviewer_id: 1, reviewer_name: demoReviewers[0].name, review_id: null },
  { assignment_id: 202, submission_id: 101, title: demoSubmissions[0].title, reviewer_id: 2, reviewer_name: demoReviewers[1].name, review_id: 301 }
];
const demoDetail = {
  submission_id: 101, title: demoSubmissions[0].title, status: 'UNDER_REVIEW',
  abstract: 'This demo record illustrates how HybridRecall presents a research paper, its review activity, and its audit trail while the database is offline.', average_score: 8.2,
  authors: [{ name: 'Dr. Ada Lovelace', email: 'ada@example.edu' }], reviews: [{ review_id: 301, reviewer_name: demoReviewers[1].name, score: 8.2, comments: 'Strong methodology and clear evaluation plan.' }], audit: [{ audit_id: 401, action: 'REVIEW_SUBMITTED', details: 'Demo review submitted.', created_at: new Date().toISOString() }]
};
const blankAuthor = () => ({ name: '', email: '', affiliation: '' });
const offlineMessage = 'Backend unavailable — showing demo data. Start the backend and configure the database to perform this action.';

function SubmitPaper({ onDone }) {
  const [title, setTitle] = useState(''); const [abstract, setAbstract] = useState(''); const [authors, setAuthors] = useState([blankAuthor()]); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async event => { event.preventDefault(); setBusy(true); setMessage(''); try { const result = await api('/api/submissions', { method: 'POST', body: JSON.stringify({ title, abstract, authors }) }); setMessage(result.message); setTitle(''); setAbstract(''); setAuthors([blankAuthor()]); onDone(); } catch (error) { setMessage(`${offlineMessage} ${error.message}`); } finally { setBusy(false); } };
  return <section className="card"><h2>Submit Paper</h2><p className="muted">Create a submission with one or more authors.</p><form onSubmit={submit}><label>Title<input value={title} onChange={e => setTitle(e.target.value)} required /></label><label>Abstract<textarea value={abstract} onChange={e => setAbstract(e.target.value)} rows="7" required /></label><h3>Authors</h3>{authors.map((author, index) => <div className="author-row" key={index}><input placeholder="Name" value={author.name} onChange={e => setAuthors(authors.map((a, i) => i === index ? { ...a, name: e.target.value } : a))} required /><input placeholder="Email" type="email" value={author.email} onChange={e => setAuthors(authors.map((a, i) => i === index ? { ...a, email: e.target.value } : a))} required /><input placeholder="Affiliation" value={author.affiliation} onChange={e => setAuthors(authors.map((a, i) => i === index ? { ...a, affiliation: e.target.value } : a))} /></div>)}<div><button type="button" className="secondary" onClick={() => setAuthors([...authors, blankAuthor()])}>+ Add author</button> <button disabled={busy}>{busy ? 'Submitting…' : 'Submit paper'}</button></div>{message && <p className="notice">{message}</p>}</form></section>;
}

function Submissions({ onSelect, refresh }) {
  const [items, setItems] = useState(demoSubmissions); const [message, setMessage] = useState('');
  useEffect(() => { let mounted = true; api('/api/submissions').then(data => mounted && setItems(data)).catch(() => mounted && setMessage(offlineMessage)); return () => { mounted = false; }; }, [refresh]);
  return <section className="card wide"><div className="section-head"><div><h2>Submissions</h2><p className="muted">Review status, scores, and similarity indicators.</p></div><button className="secondary" onClick={() => window.location.reload()}>Refresh</button></div>{message && <p className="notice">{message}</p>}<table><thead><tr><th>Title</th><th>Status</th><th>Average</th><th>Similarity</th></tr></thead><tbody>{items.map(item => <tr key={item.submission_id} onClick={() => onSelect(item.submission_id)}><td>{item.title}</td><td><span className={`status ${item.status.toLowerCase()}`}>{item.status}</span></td><td>{item.average_score ?? '—'}</td><td>{item.has_similarity_warning ? '⚠ Warning' : '—'}</td></tr>)}</tbody></table></section>;
}

function AssignReview({ reviewers, refresh }) {
  const [assignments, setAssignments] = useState(demoAssignments); const [submissionId, setSubmissionId] = useState(''); const [reviewerId, setReviewerId] = useState(''); const [selected, setSelected] = useState(''); const [score, setScore] = useState(''); const [comments, setComments] = useState(''); const [message, setMessage] = useState('');
  const load = () => api('/api/assignments').then(setAssignments).catch(() => setMessage(offlineMessage));
  useEffect(() => { load(); }, [refresh]);
  const assign = async event => { event.preventDefault(); try { setMessage((await api(`/api/submissions/${submissionId}/assignments`, { method: 'POST', body: JSON.stringify({ reviewer_id: reviewerId }) })).message); setSubmissionId(''); load(); } catch (error) { setMessage(`${offlineMessage} ${error.message}`); } };
  const review = async event => { event.preventDefault(); try { setMessage((await api(`/api/assignments/${selected}/review`, { method: 'POST', body: JSON.stringify({ score, comments }) })).message); setScore(''); setComments(''); load(); } catch (error) { setMessage(`${offlineMessage} ${error.message}`); } };
  return <><section className="grid"><div className="card"><h2>Assign Reviewer</h2><p className="muted">Assign a reviewer by submission ID.</p><form onSubmit={assign}><label>Submission ID<input type="number" min="1" placeholder="e.g. 101" value={submissionId} onChange={e => setSubmissionId(e.target.value)} required /></label><label>Reviewer<select value={reviewerId} onChange={e => setReviewerId(e.target.value)} required><option value="">Select reviewer</option>{reviewers.map(reviewer => <option key={reviewer.reviewer_id} value={reviewer.reviewer_id}>{reviewer.name} — {reviewer.expertise}</option>)}</select></label><button>Assign reviewer</button></form></div><div className="card"><h2>Submit Review</h2><p className="muted">Choose an open assignment and record a score.</p><form onSubmit={review}><label>Assignment<select value={selected} onChange={e => setSelected(e.target.value)} required><option value="">Select assignment</option>{assignments.filter(assignment => !assignment.review_id).map(assignment => <option key={assignment.assignment_id} value={assignment.assignment_id}>#{assignment.assignment_id} — {assignment.title} ({assignment.reviewer_name})</option>)}</select></label><label>Score (1–10)<input type="number" min="1" max="10" step="0.1" value={score} onChange={e => setScore(e.target.value)} required /></label><label>Comments<textarea value={comments} onChange={e => setComments(e.target.value)} rows="4" required /></label><button>Submit review</button></form></div></section>{message && <p className="notice">{message}</p>}<section className="card wide"><h3>Current assignments</h3><table><thead><tr><th>ID</th><th>Submission</th><th>Reviewer</th><th>Review</th></tr></thead><tbody>{assignments.map(assignment => <tr key={assignment.assignment_id}><td>#{assignment.assignment_id}</td><td>{assignment.title}</td><td>{assignment.reviewer_name}</td><td>{assignment.review_id ? 'Submitted' : 'Awaiting review'}</td></tr>)}</tbody></table></section></>;
}

function Detail({ id, onBack }) {
  const [data, setData] = useState(id === 101 ? demoDetail : null); const [message, setMessage] = useState(id === 101 ? offlineMessage : '');
  useEffect(() => { let mounted = true; api(`/api/submissions/${id}`).then(result => { if (mounted) { setData(result); setMessage(''); } }).catch(() => mounted && setMessage(offlineMessage)); return () => { mounted = false; }; }, [id]);
  if (!data) return <section className="card"><button className="secondary" onClick={onBack}>← Back</button><p className="notice">{message || 'Loading submission…'}</p></section>;
  const finalize = async () => { try { setMessage((await api(`/api/submissions/${id}/finalize`, { method: 'POST' })).message); setData(await api(`/api/submissions/${id}`)); } catch (error) { setMessage(`${offlineMessage} ${error.message}`); } };
  return <section className="card wide"><button className="secondary" onClick={onBack}>← Back</button><h2>{data.title}</h2><p className="muted">{data.authors.map(author => `${author.name} (${author.email})`).join(', ')}</p><p>{data.abstract}</p><div className="detail-bar"><span className={`status ${data.status.toLowerCase()}`}>{data.status}</span><strong>Average: {data.average_score ?? '—'}</strong>{!['ACCEPTED', 'REJECTED'].includes(data.status) && <button onClick={finalize}>Finalize decision</button>}</div>{message && <p className="notice">{message}</p>}<h3>Reviews</h3>{data.reviews.length ? <table><thead><tr><th>Reviewer</th><th>Score</th><th>Comments</th></tr></thead><tbody>{data.reviews.map(review => <tr key={review.review_id}><td>{review.reviewer_name}</td><td>{review.score}</td><td>{review.comments}</td></tr>)}</tbody></table> : <p className="muted">No reviews submitted.</p>}<h3>Audit log</h3><ul className="audit">{data.audit.map(audit => <li key={audit.audit_id}><strong>{audit.action}</strong> — {audit.details} <small>{new Date(audit.created_at).toLocaleString()}</small></li>)}</ul></section>;
}

export default function App() {
  const [page, setPage] = useState('submissions'); const [detail, setDetail] = useState(null); const [reviewers, setReviewers] = useState(demoReviewers); const [refresh, setRefresh] = useState(0);
  useEffect(() => { let mounted = true; api('/api/reviewers').then(data => mounted && setReviewers(data)).catch(() => {}); return () => { mounted = false; }; }, []);
  const select = id => { setDetail(id); setPage('detail'); };
  return <><header><div><h1>HybridRecall</h1><p>Research-paper review management</p></div><nav><button className={page === 'submit' ? 'active' : ''} onClick={() => setPage('submit')}>Submit Paper</button><button className={page === 'submissions' ? 'active' : ''} onClick={() => { setPage('submissions'); setDetail(null); }}>Submissions</button><button className={page === 'review' ? 'active' : ''} onClick={() => setPage('review')}>Assign &amp; Review</button></nav></header><main>{page === 'submit' && <SubmitPaper onDone={() => { setRefresh(refresh + 1); setPage('submissions'); }} />}{page === 'submissions' && <Submissions onSelect={select} refresh={refresh} />}{page === 'review' && <AssignReview reviewers={reviewers} refresh={refresh} />}{page === 'detail' && <Detail id={detail} onBack={() => setPage('submissions')} />}</main></>;
}
