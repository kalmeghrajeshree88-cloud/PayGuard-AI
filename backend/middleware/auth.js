const jwt = require('jsonwebtoken');
const crypto = require('crypto');

let secret = process.env.JWT_SECRET;
if (!secret || secret.startsWith('change-me')) {
  if (process.env.NODE_ENV === 'production') throw new Error('Set a strong JWT_SECRET in production');
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('[auth] JWT_SECRET not set - using a random secret (logins reset on restart)');
}

const sign = (user) => jwt.sign({ sub: user.id }, secret, { expiresIn: '2h' });

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = { id: jwt.verify(token, secret).sub };
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

module.exports = { sign, requireAuth };
