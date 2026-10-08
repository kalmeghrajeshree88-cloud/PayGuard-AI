const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../store');
const { sign, requireAuth } = require('../middleware/auth');

const router = express.Router();
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, averageTransaction: u.averageTransaction });

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (typeof name !== 'string' || name.trim().length < 2 || name.length > 60) return res.status(400).json({ error: 'Enter your name (2-60 characters)' });
    if (typeof email !== 'string' || !emailRe.test(email) || email.length > 120) return res.status(400).json({ error: 'Enter a valid email' });
    if (typeof password !== 'string' || password.length < 8 || password.length > 100) return res.status(400).json({ error: 'Password must be 8-100 characters' });
    const clean = email.trim().toLowerCase();
    if (await store.findUserByEmail(clean)) return res.status(409).json({ error: 'Email already registered' });
    const user = await store.createUser({
      name: name.trim(),
      email: clean,
      passwordHash: await bcrypt.hash(password, 10),
      averageTransaction: 3000,
      usualLocations: ['Pune'],
      trustedDevices: ['macbook-demo'],
      knownRecipients: [],
      riskProfile: 'standard',
    });
    res.status(201).json({ token: sign(user), user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Email and password are required' });
    const user = await store.findUserByEmail(email.trim().toLowerCase());
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
    res.json({ token: sign(user), user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await store.getUserById(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({ user: publicUser(user) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
