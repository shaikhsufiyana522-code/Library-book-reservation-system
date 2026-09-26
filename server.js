require('dotenv').config();
const express = require('express'), helmet = require('helmet'), rate = require('express-rate-limit'), path = require('path');
const db = require('./config/db');
const { auth, admin } = require('./middleware/auth');
if (!process.env.JWT_SECRET) { console.error('JWT_SECRET missing in .env'); process.exit(1); }

const app = express();
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'"], imgSrc: ["'self'", 'data:'],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc: ['https://fonts.gstatic.com'], upgradeInsecureRequests: null } } }));
app.use(express.json({ limit: '10kb' }));
app.use('/api/auth', rate({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false,
  message: { message: 'Too many attempts, try again in 15 minutes' } }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/books', require('./routes/books'));
const reservations = require('./routes/reservations');
app.use('/api/reservations', reservations);
app.get('/api/stats', auth, admin, async (req, res, next) => {
  try {
    const [[s]] = await db.query(`SELECT (SELECT COUNT(*) FROM books) books,
      (SELECT COUNT(*) FROM users WHERE role='member') members,
      (SELECT COUNT(*) FROM reservations WHERE status IN ('pending','ready','issued')) active,
      (SELECT COUNT(*) FROM reservations WHERE status='issued' AND due_date<CURDATE()) overdue`);
    res.json(s);
  } catch (e) { next(e); }
});
app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));
app.use(express.static(path.join(__dirname, '../frontend')));
app.use((e, req, res, next) => {
  if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'ISBN already exists', errors: { isbn: 'ISBN already exists' } });
  if (e.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON' });
  if (!e.status) console.error(e);
  res.status(e.status || 500).json({ message: e.status ? e.message : 'Server error' });
});

setInterval(() => reservations.expireStale().catch(console.error), 10 * 60 * 1000);
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Library running on http://localhost:${PORT}`));
