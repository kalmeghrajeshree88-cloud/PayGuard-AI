require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const store = require('./store');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '10kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, message: { error: 'Too many attempts, try again later' } });

app.get('/api/health', (req, res) =>
  res.json({
    ok: true,
    store: store.name,
    ai: process.env.AI_API_KEY ? 'llm' : 'rule-based',
    paypal: process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET ? 'sandbox' : 'simulated',
  })
);
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api', require('./routes/dashboard'));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const port = process.env.PORT || 5000;
store
  .init()
  .then(() => app.listen(port, () => console.log(`[server] PayGuard API on http://localhost:${port}`)))
  .catch((e) => {
    console.error('[server] failed to start:', e.message);
    process.exit(1);
  });

module.exports = app;
