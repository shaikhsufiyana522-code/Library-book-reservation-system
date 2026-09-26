const r = require('express').Router();
const bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const db = require('../config/db');
const { validate } = require('../middleware/auth');
const sign = u => jwt.sign({ id: u.id, name: u.name, role: u.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

r.post('/register', [
  body('name').trim().matches(/^[A-Za-z .'-]{2,60}$/).withMessage('Name must be 2-60 letters'),
  body('email').trim().isEmail().withMessage('Enter a valid email').isLength({ max: 100 }).normalizeEmail(),
  body('password').isLength({ min: 8, max: 64 }).withMessage('Password must be 8-64 characters')
    .matches(/[A-Z]/).withMessage('Password needs an uppercase letter')
    .matches(/\d/).withMessage('Password needs a number'),
  body('confirm').custom((v, { req }) => v === req.body.password).withMessage('Passwords do not match')
], validate, async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const [dup] = await db.query('SELECT id FROM users WHERE email=?', [email]);
    if (dup.length) return res.status(409).json({ message: 'Email already registered', errors: { email: 'Email already registered' } });
    const [i] = await db.query('INSERT INTO users(name,email,password) VALUES(?,?,?)', [name, email, await bcrypt.hash(password, 10)]);
    const user = { id: i.insertId, name, role: 'member' };
    res.status(201).json({ token: sign(user), user });
  } catch (e) { next(e); }
});

r.post('/login', [
  body('email').trim().isEmail().withMessage('Enter a valid email').normalizeEmail(),
  body('password').notEmpty().withMessage('Password required')
], validate, async (req, res, next) => {
  try {
    const [[u]] = await db.query('SELECT * FROM users WHERE email=?', [req.body.email]);
    if (!u || !(await bcrypt.compare(req.body.password, u.password)))
      return res.status(401).json({ message: 'Invalid email or password' });
    res.json({ token: sign(u), user: { id: u.id, name: u.name, role: u.role } });
  } catch (e) { next(e); }
});
module.exports = r;
