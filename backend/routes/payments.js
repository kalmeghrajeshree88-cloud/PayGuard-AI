const express = require('express');
const crypto = require('crypto');
const store = require('../store');
const { requireAuth } = require('../middleware/auth');
const { parseIntent } = require('../services/intentEngine');
const { analyze } = require('../services/riskEngine');
const paypal = require('../services/paypalService');
const cfg = require('../config/riskConfig');

const router = express.Router();
router.use(requireAuth);

const demoMode = () => process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const clean = (s, max) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

// Never send OTP hashes or internal fields to the client.
const view = (t) => {
  if (!t) return null;
  const { otpHash, otpExpires, otpAttempts, ...rest } = t;
  return rest;
};

function validate(body) {
  const b = body || {};
  const recipient = clean(b.recipient, 80);
  const purpose = clean(b.purpose, 120);
  const description = clean(b.description, 500);
  const amount = Number(b.amount);
  const ctx = b.context || {};
  if (recipient.length < 2) return { error: 'Enter a recipient (at least 2 characters)' };
  if (purpose.length < 2) return { error: 'Enter the purpose of the payment' };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) return { error: 'Enter an amount between 1 and 1,00,00,000' };
  return {
    payment: { recipient, amount: Math.round(amount * 100) / 100, purpose, description },
    context: { deviceId: clean(ctx.deviceId, 64), location: clean(ctx.location, 64) },
  };
}

async function ownedTxn(req, res) {
  const id = clean(req.body && req.body.transactionId, 64);
  const txn = id ? await store.getTransaction(id) : null;
  if (!txn || txn.userId !== req.user.id) {
    res.status(404).json({ error: 'Transaction not found' });
    return null;
  }
  return txn;
}

// 1) Analyze: parse intent -> score risk -> choose verification level
router.post('/analyze', async (req, res, next) => {
  try {
    const v = validate(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const user = await store.getUserById(req.user.id);
    const intent = await parseIntent({ ...v.payment });
    const result = analyze({ user, payment: v.payment, context: v.context, intent });

    const required = cfg.verification[result.decision];
    const base = {
      userId: req.user.id,
      ...v.payment,
      context: v.context,
      intent,
      riskScore: result.riskScore,
      riskLevel: result.riskLevel,
      decision: result.decision,
      intentConsistency: result.intentConsistency,
      explanation: result.explanation,
      factors: result.factors,
      verificationRequired: required,
      verificationStatus: required === 'none' ? 'not_required' : required === 'blocked' ? 'blocked' : 'pending',
      status: result.decision === 'hold' ? 'held' : 'analyzed',
    };

    let otp = null;
    if (required === 'otp') {
      otp = String(crypto.randomInt(100000, 1000000));
      base.otpHash = sha(otp);
      base.otpExpires = Date.now() + 5 * 60 * 1000;
      base.otpAttempts = 0;
    }

    const txn = await store.addTransaction(base);
    await store.addRiskEvents(
      result.factors.filter((f) => f.score > 0).map((f) => ({ userId: req.user.id, transactionId: txn.id, factor: f.factor, score: f.score, explanation: f.explanation }))
    );
    res.status(201).json({ transaction: view(txn), ...(otp && demoMode() ? { demoOtp: otp } : {}) });
  } catch (e) {
    next(e);
  }
});

// 2) Verify: confirm / OTP / request manual review (for held payments)
router.post('/verify', async (req, res, next) => {
  try {
    const txn = await ownedTxn(req, res);
    if (!txn) return;
    const method = clean(req.body.method, 20);

    if (['completed', 'cancelled', 'awaiting_paypal'].includes(txn.status)) return res.status(409).json({ error: `Payment is already ${txn.status}` });

    if (txn.decision === 'hold') {
      if (method !== 'review') return res.status(403).json({ error: 'This payment is on hold. Request a manual review instead.' });
      const updated = await store.updateTransaction(txn.id, { status: 'under_review', verificationStatus: 'review_requested' });
      return res.json({ transaction: view(updated) });
    }
    if (txn.decision === 'approve') return res.json({ transaction: view(txn) });

    if (txn.decision === 'verify') {
      if (method !== 'confirm') return res.status(400).json({ error: 'Confirmation required' });
      const updated = await store.updateTransaction(txn.id, { status: 'verified', verificationStatus: 'verified' });
      return res.json({ transaction: view(updated) });
    }

    // strong_verify -> OTP
    if (method !== 'otp') return res.status(400).json({ error: 'One-time code required' });
    if ((txn.otpAttempts || 0) >= 5) return res.status(429).json({ error: 'Too many wrong attempts. Start a new payment.' });
    if (Date.now() > txn.otpExpires) return res.status(400).json({ error: 'Code expired. Start a new payment.' });
    const code = clean(req.body.otp, 10);
    const a = Buffer.from(sha(code));
    const b = Buffer.from(txn.otpHash || '');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      await store.updateTransaction(txn.id, { otpAttempts: (txn.otpAttempts || 0) + 1 });
      return res.status(400).json({ error: 'Incorrect code' });
    }
    const updated = await store.updateTransaction(txn.id, { status: 'verified', verificationStatus: 'verified' });
    res.json({ transaction: view(updated) });
  } catch (e) {
    next(e);
  }
});

// 3) Execute: only if approved or verified. Creates the PayPal Sandbox order.
router.post('/execute', async (req, res, next) => {
  try {
    const txn = await ownedTxn(req, res);
    if (!txn) return;
    const allowed = txn.decision === 'approve' ? txn.status === 'analyzed' : txn.status === 'verified';
    if (!allowed) return res.status(403).json({ error: 'This payment has not been approved or verified' });

    const order = await paypal.createOrder(txn);
    if (order.simulated) {
      const cap = await paypal.captureOrder(order.orderId);
      const done = await finalize(req.user.id, txn, { paypalOrderId: order.orderId, paypalCaptureId: cap.captureId, paymentMode: 'simulated' });
      return res.json({ mode: 'simulated', transaction: view(done) });
    }
    const updated = await store.updateTransaction(txn.id, { status: 'awaiting_paypal', paypalOrderId: order.orderId, paymentMode: 'paypal_sandbox' });
    res.json({ mode: 'paypal_sandbox', approveUrl: order.approveUrl, transaction: view(updated) });
  } catch (e) {
    next(e);
  }
});

// 4) Capture: called after the user approves in PayPal and returns to the app.
router.post('/capture', async (req, res, next) => {
  try {
    const txn = await ownedTxn(req, res);
    if (!txn) return;
    if (txn.status === 'completed') return res.json({ transaction: view(txn) });
    if (txn.status !== 'awaiting_paypal') return res.status(409).json({ error: 'Payment is not waiting for PayPal' });
    const orderId = clean(req.body.orderId, 64);
    if (!orderId || orderId !== txn.paypalOrderId) return res.status(400).json({ error: 'PayPal order does not match this payment' });
    const cap = await paypal.captureOrder(orderId);
    if (cap.status !== 'COMPLETED') {
      const failed = await store.updateTransaction(txn.id, { status: 'failed' });
      return res.status(402).json({ error: `PayPal returned status ${cap.status}`, transaction: view(failed) });
    }
    const done = await finalize(req.user.id, txn, {
      paypalCaptureId: cap.captureId,
      paypalPayerEmail: cap.payerEmail || null,
      paypalFee: cap.fee || null,
      paypalPaidAmount: cap.paidAmount || null,
      paypalCurrency: cap.currency || null,
    });
    res.json({ transaction: view(done) });
  } catch (e) {
    next(e);
  }
});

// Refund a completed payment (e.g. one flagged as fraud after the fact).
router.post('/refund', async (req, res, next) => {
  try {
    const txn = await ownedTxn(req, res);
    if (!txn) return;
    if (txn.status !== 'completed' || !txn.paypalCaptureId) return res.status(409).json({ error: 'Only completed payments can be refunded' });
    const r = await paypal.refundCapture(txn.paypalCaptureId);
    if (!['COMPLETED', 'PENDING'].includes(r.status)) return res.status(402).json({ error: `PayPal returned refund status ${r.status}` });
    const updated = await store.updateTransaction(txn.id, { status: 'refunded', refundId: r.refundId, refundedAt: new Date().toISOString() });
    res.json({ transaction: view(updated) });
  } catch (e) {
    next(e);
  }
});

router.post('/cancel', async (req, res, next) => {
  try {
    const txn = await ownedTxn(req, res);
    if (!txn) return;
    if (txn.status === 'completed') return res.status(409).json({ error: 'Payment already completed' });
    res.json({ transaction: view(await store.updateTransaction(txn.id, { status: 'cancelled' })) });
  } catch (e) {
    next(e);
  }
});

// Mark completed and let the system learn: remember the recipient, update the average.
async function finalize(userId, txn, extra) {
  const done = await store.updateTransaction(txn.id, { status: 'completed', completedAt: new Date().toISOString(), ...extra });
  const user = await store.getUserById(userId);
  const list = user.knownRecipients || [];
  const existing = list.find((r) => r.name.toLowerCase() === txn.recipient.toLowerCase());
  if (existing) existing.count = (existing.count || 0) + 1;
  else list.push({ name: txn.recipient, category: (txn.intent && txn.intent.category) || 'other', count: 1 });
  const all = (await store.listTransactions(userId)).filter((t) => t.status === 'completed');
  const avg = all.length ? all.reduce((s, t) => s + t.amount, 0) / all.length : user.averageTransaction;
  // Blend with the existing baseline so one payment does not rewrite the user's profile.
  const averageTransaction = Math.round(user.averageTransaction * 0.8 + avg * 0.2);
  await store.updateUser(userId, { knownRecipients: list, averageTransaction });
  return done;
}

router.get('/', async (req, res, next) => {
  try {
    const list = (await store.listTransactions(req.user.id)).reverse().map(view);
    res.json({ transactions: list });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
