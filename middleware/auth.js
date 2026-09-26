const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
exports.auth = (req, res, next) => {
  const t = (req.headers.authorization || '').split(' ')[1];
  if (!t) return res.status(401).json({ message: 'Login required' });
  try { req.user = jwt.verify(t, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ message: 'Session expired, please login again' }); }
};
exports.admin = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ message: 'Admin access only' });
exports.validate = (req, res, next) => {
  const e = validationResult(req);
  if (e.isEmpty()) return next();
  const errors = {};
  e.array().forEach(x => { if (!errors[x.path]) errors[x.path] = x.msg; });
  res.status(422).json({ message: e.array()[0].msg, errors });
};
