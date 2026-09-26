const r = require('express').Router();
const { body, param } = require('express-validator');
const db = require('../config/db');
const { auth, admin, validate } = require('../middleware/auth');
const ACTIVE = "('pending','ready','issued')", FINE = 5, MAX_ACTIVE = 5;
const pid = param('id').isInt({ min: 1 }).withMessage('Invalid id');
const fail = (status, message) => Object.assign(new Error(message), { status });
const SEL = `r.*,b.title,b.author,
  GREATEST(0,DATEDIFF(CURDATE(),r.due_date))*${FINE} AS est_fine,
  (SELECT COUNT(*)+1 FROM reservations x WHERE x.book_id=r.book_id AND x.status='pending'
    AND (x.reserved_at<r.reserved_at OR (x.reserved_at=r.reserved_at AND x.id<r.id))) AS queue_pos`;

async function tx(fn) {
  const c = await db.getConnection();
  try { await c.beginTransaction(); const v = await fn(c); await c.commit(); return v; }
  catch (e) { await c.rollback(); throw e; }
  finally { c.release(); }
}
// a copy came back: give it to the next person in the queue, else put it on the shelf
async function release(c, bookId) {
  const [[n]] = await c.query("SELECT id FROM reservations WHERE book_id=? AND status='pending' ORDER BY reserved_at,id LIMIT 1 FOR UPDATE", [bookId]);
  if (n) await c.query("UPDATE reservations SET status='ready',expires_at=DATE_ADD(NOW(),INTERVAL 2 DAY) WHERE id=?", [n.id]);
  else await c.query('UPDATE books SET available_copies=available_copies+1 WHERE id=?', [bookId]);
}

r.post('/', auth, [body('book_id').isInt({ min: 1 }).withMessage('Select a valid book').toInt()], validate, async (req, res, next) => {
  try {
    const ready = await tx(async c => {
      const [[b]] = await c.query('SELECT * FROM books WHERE id=? FOR UPDATE', [req.body.book_id]);
      if (!b) throw fail(404, 'Book not found');
      const [[d]] = await c.query(`SELECT id FROM reservations WHERE user_id=? AND book_id=? AND status IN ${ACTIVE}`, [req.user.id, b.id]);
      if (d) throw fail(409, 'You already have an active reservation for this book');
      const [[k]] = await c.query(`SELECT COUNT(*) n FROM reservations WHERE user_id=? AND status IN ${ACTIVE}`, [req.user.id]);
      if (k.n >= MAX_ACTIVE) throw fail(400, `Limit reached: max ${MAX_ACTIVE} active reservations`);
      const ok = b.available_copies > 0;
      if (ok) await c.query('UPDATE books SET available_copies=available_copies-1 WHERE id=?', [b.id]);
      await c.query(`INSERT INTO reservations(user_id,book_id,status,expires_at) VALUES(?,?,?,${ok ? 'DATE_ADD(NOW(),INTERVAL 2 DAY)' : 'NULL'})`,
        [req.user.id, b.id, ok ? 'ready' : 'pending']);
      return ok;
    });
    res.status(201).json({ message: ready ? 'Reserved. Collect it within 2 days.' : 'You are on the waitlist. It will be held for you when a copy returns.' });
  } catch (e) { next(e); }
});

r.get('/mine', auth, async (req, res, next) => {
  try { const [rows] = await db.query(`SELECT ${SEL} FROM reservations r JOIN books b ON b.id=r.book_id WHERE r.user_id=? ORDER BY r.reserved_at DESC`, [req.user.id]); res.json(rows); }
  catch (e) { next(e); }
});

r.get('/', auth, admin, async (req, res, next) => {
  try {
    const [rows] = await db.query(`SELECT ${SEL},u.name AS user_name,u.email FROM reservations r JOIN books b ON b.id=r.book_id JOIN users u ON u.id=r.user_id ORDER BY r.reserved_at DESC LIMIT 200`);
    res.json(rows);
  } catch (e) { next(e); }
});

r.patch('/:id/cancel', auth, pid, validate, async (req, res, next) => {
  try {
    await tx(async c => {
      const [[x]] = await c.query('SELECT * FROM reservations WHERE id=? FOR UPDATE', [req.params.id]);
      if (!x || (x.user_id !== req.user.id && req.user.role !== 'admin')) throw fail(404, 'Reservation not found');
      if (!['pending', 'ready'].includes(x.status)) throw fail(400, 'Only waiting or ready reservations can be cancelled');
      await c.query("UPDATE reservations SET status='cancelled' WHERE id=?", [x.id]);
      if (x.status === 'ready') await release(c, x.book_id);
    });
    res.json({ message: 'Reservation cancelled' });
  } catch (e) { next(e); }
});

r.patch('/:id/issue', auth, admin, pid, validate, async (req, res, next) => {
  try {
    await tx(async c => {
      const [[x]] = await c.query('SELECT status FROM reservations WHERE id=? FOR UPDATE', [req.params.id]);
      if (!x || x.status !== 'ready') throw fail(400, 'Only ready reservations can be issued');
      await c.query("UPDATE reservations SET status='issued',issue_date=CURDATE(),due_date=DATE_ADD(CURDATE(),INTERVAL 14 DAY),expires_at=NULL WHERE id=?", [req.params.id]);
    });
    res.json({ message: 'Book issued for 14 days' });
  } catch (e) { next(e); }
});

r.patch('/:id/return', auth, admin, pid, validate, async (req, res, next) => {
  try {
    await tx(async c => {
      const [[x]] = await c.query('SELECT * FROM reservations WHERE id=? FOR UPDATE', [req.params.id]);
      if (!x || x.status !== 'issued') throw fail(400, 'Only issued books can be returned');
      await c.query(`UPDATE reservations SET status='returned',return_date=CURDATE(),fine=GREATEST(0,DATEDIFF(CURDATE(),due_date))*${FINE} WHERE id=?`, [x.id]);
      await release(c, x.book_id);
    });
    res.json({ message: 'Book returned' });
  } catch (e) { next(e); }
});

// ready reservations not collected in 2 days expire and pass to the next person
r.expireStale = async () => {
  const [rows] = await db.query("SELECT id FROM reservations WHERE status='ready' AND expires_at<NOW()");
  for (const { id } of rows) await tx(async c => {
    const [[x]] = await c.query("SELECT * FROM reservations WHERE id=? AND status='ready' FOR UPDATE", [id]);
    if (!x) return;
    await c.query("UPDATE reservations SET status='expired' WHERE id=?", [id]);
    await release(c, x.book_id);
  });
};
module.exports = r;
