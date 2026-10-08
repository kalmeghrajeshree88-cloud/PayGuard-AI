const express = require('express');
const store = require('../store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const strip = ({ otpHash, otpExpires, otpAttempts, ...rest }) => rest;

router.get('/dashboard/summary', async (req, res, next) => {
  try {
    const txns = (await store.listTransactions(req.user.id)).map(strip);
    const count = (fn) => txns.filter(fn).length;
    const total = txns.length;
    const last10 = txns.slice(-10);
    const avgRisk = last10.length ? last10.reduce((s, t) => s + t.riskScore, 0) / last10.length : 0;
    const challenged = count((t) => t.decision !== 'approve');

    res.json({
      kpis: {
        total,
        low: count((t) => t.riskLevel === 'low'),
        medium: count((t) => t.riskLevel === 'medium'),
        high: count((t) => t.riskLevel === 'high'),
        critical: count((t) => t.riskLevel === 'critical'),
        verificationRate: total ? Math.round((challenged / total) * 100) : 0,
        completedVolume: txns.filter((t) => t.status === 'completed').reduce((s, t) => s + t.amount, 0),
        refunded: count((t) => t.status === 'refunded'),
        blocked: count((t) => ['held', 'under_review'].includes(t.status)),
        safetyScore: Math.round(100 - avgRisk),
      },
      series: txns.slice(-30).map((t, i) => ({ n: i + 1, label: t.recipient, riskScore: t.riskScore, amount: t.amount })),
      decisions: ['approve', 'verify', 'strong_verify', 'hold'].map((d) => ({ name: d, value: count((t) => t.decision === d) })),
      alerts: txns.filter((t) => t.decision !== 'approve').slice(-5).reverse(),
      recent: txns.slice(-10).reverse(),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/risk/history', async (req, res, next) => {
  try {
    res.json({ events: await store.listRiskEvents(req.user.id, 100) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
