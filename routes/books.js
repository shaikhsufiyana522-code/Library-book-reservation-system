const r = require('express').Router();
const { body, param, query } = require('express-validator');
const db = require('../config/db');
const { auth, admin, validate } = require('../middleware/auth');
const pid = param('id').isInt({ min: 1 }).withMessage('Invalid id');
const rules = [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title is required (max 200)'),
  body('author').trim().isLength({ min: 2, max: 100 }).withMessage('Author is required (2-100)'),
  body('category').trim().isLength({ min: 2, max: 50 }).withMessage('Category is required (2-50)'),
  body('isbn').trim().matches(/^(\d{10}|\d{13})$/).withMessage('ISBN must be 10 or 13 digits'),
  body('total_copies').isInt({ min: 1, max: 1000 }).withMessage('Copies must be 1-1000').toInt()
];

r.get('/', [query('q').optional().trim().isLength({ max: 100 }), query('category').optional().trim().isLength({ max: 50 })],
  validate, async (req, res, next) => {
    try {
      const { q = '', category = '' } = req.query, like = `%${q}%`;
      const [rows] = await db.query(
        'SELECT * FROM books WHERE (title LIKE ? OR author LIKE ? OR isbn LIKE ?) AND (?="" OR category=?) ORDER BY title',
        [like, like, like, category, category]);
      res.json(rows);
    } catch (e) { next(e); }
  });

r.get('/categories', async (req, res, next) => {
  try { const [rows] = await db.query('SELECT DISTINCT category FROM books ORDER BY category'); res.json(rows.map(x => x.category)); }
  catch (e) { next(e); }
});

r.post('/', auth, admin, rules, validate, async (req, res, next) => {
  try {
    const b = req.body;
    await db.query('INSERT INTO books(title,author,category,isbn,total_copies,available_copies) VALUES(?,?,?,?,?,?)',
      [b.title, b.author, b.category, b.isbn, b.total_copies, b.total_copies]);
    res.status(201).json({ message: 'Book added' });
  } catch (e) { next(e); }
});

r.put('/:id', auth, admin, pid, rules, validate, async (req, res, next) => {
  try {
    const b = req.body;
    const [u] = await db.query(
      'UPDATE books SET title=?,author=?,category=?,isbn=?,available_copies=GREATEST(0,available_copies+(?-total_copies)),total_copies=? WHERE id=?',
      [b.title, b.author, b.category, b.isbn, b.total_copies, b.total_copies, req.params.id]);
    if (!u.affectedRows) return res.status(404).json({ message: 'Book not found' });
    res.json({ message: 'Book updated' });
  } catch (e) { next(e); }
});

r.delete('/:id', auth, admin, pid, validate, async (req, res, next) => {
  try {
    const [[c]] = await db.query("SELECT COUNT(*) n FROM reservations WHERE book_id=? AND status IN ('pending','ready','issued')", [req.params.id]);
    if (c.n) return res.status(409).json({ message: 'Book has active reservations or is issued' });
    await db.query('DELETE FROM books WHERE id=?', [req.params.id]);
    res.json({ message: 'Book deleted' });
  } catch (e) { next(e); }
});
module.exports = r;
