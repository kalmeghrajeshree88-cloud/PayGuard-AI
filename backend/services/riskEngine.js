// Deterministic, explainable, rule-based risk scoring. Weights live in config/riskConfig.js.
const cfg = require('../config/riskConfig');

const norm = (s) => String(s || '').trim().toLowerCase();
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });

function findKnownRecipient(user, name) {
  const n = norm(name);
  return (user.knownRecipients || []).find((r) => norm(r.name) === n) || null;
}

function namesOverlap(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return true; // no information -> not a mismatch
  return x.includes(y) || y.includes(x);
}

function bucket(score) {
  return cfg.thresholds.find((t) => score <= t.max) || cfg.thresholds[cfg.thresholds.length - 1];
}

function analyze({ user, payment, context = {}, intent = {} }) {
  const w = cfg.weights;
  const factors = [];
  const add = (factor, score, explanation) => factors.push({ factor, score, explanation });

  // 1) Amount anomaly
  const avg = user.averageTransaction > 0 ? user.averageTransaction : 1;
  const ratio = payment.amount / avg;
  const tier = cfg.amountTiers.find((t) => ratio <= t.maxRatio);
  add(
    'Amount anomaly',
    tier.score,
    tier.score
      ? `Amount ${inr(payment.amount)} is ${ratio.toFixed(1)}x your average payment of ${inr(avg)}`
      : `Amount is in line with your usual payments (${inr(avg)} average)`
  );

  // 2) Recipient risk
  const known = findKnownRecipient(user, payment.recipient);
  add(
    'Recipient',
    known ? 0 : w.newRecipient,
    known ? `${payment.recipient} is a recipient you have paid before` : `${payment.recipient} is a new recipient`
  );

  // 3) Location anomaly
  const loc = norm(context.location);
  const locKnown = !loc || (user.usualLocations || []).some((l) => norm(l) === loc);
  add(
    'Location',
    locKnown ? 0 : w.unusualLocation,
    locKnown ? 'Payment is from a usual location' : `Payment is from an unusual location (${context.location})`
  );

  // 4) Device anomaly
  const dev = norm(context.deviceId);
  const devKnown = !dev || (user.trustedDevices || []).some((d) => norm(d) === dev);
  add(
    'Device',
    devKnown ? 0 : w.untrustedDevice,
    devKnown ? 'Payment is from a trusted device' : 'Payment is from a device you have not used before'
  );

  // 5) Intent consistency (what the user says vs what the transaction looks like)
  const issues = [];
  if (intent.amount != null && Math.abs(intent.amount - payment.amount) / Math.max(payment.amount, 1) > 0.01) {
    issues.push(`the description says ${inr(intent.amount)} but the payment is ${inr(payment.amount)}`);
  }
  if (intent.recipient && !namesOverlap(intent.recipient, payment.recipient)) {
    issues.push(`the description names "${intent.recipient}" but the recipient is "${payment.recipient}"`);
  }
  if (known && known.category && intent.category && intent.category !== 'other' && known.category !== intent.category) {
    issues.push(`${payment.recipient} is usually paid for ${known.category}, not ${intent.category}`);
  }
  const mismatchScore = Math.min(w.intentMismatchMax, issues.length * w.intentMismatchPerIssue);
  add(
    'Intent consistency',
    mismatchScore,
    issues.length ? `Stated intent does not match the transaction: ${issues.join('; ')}` : 'Stated intent matches the transaction'
  );

  // 6) Intent confidence
  const conf = typeof intent.confidence === 'number' ? intent.confidence : 0.5;
  let confScore = 0;
  if (conf < cfg.lowConfidenceBelow) confScore = w.lowConfidence;
  else if (conf < cfg.mediumConfidenceBelow) confScore = w.mediumConfidence;
  add(
    'Intent confidence',
    confScore,
    confScore ? `Payment intent is unclear (confidence ${Math.round(conf * 100)}%)` : `Payment intent is clear (confidence ${Math.round(conf * 100)}%)`
  );

  // 7) Scam signals in the description
  const signals = intent.scamSignals || [];
  add(
    'Scam signals',
    signals.length ? w.scamSignals : 0,
    signals.length ? `Description has scam-like cues: ${signals.join(', ')}` : 'No scam-like cues in the description'
  );

  const riskScore = Math.min(100, factors.reduce((s, f) => s + f.score, 0));
  const { level, decision } = bucket(riskScore);
  const intentConsistency = issues.length === 0 && conf >= cfg.mediumConfidenceBelow ? 'high' : issues.length <= 1 && conf >= cfg.lowConfidenceBelow ? 'medium' : 'low';

  return { riskScore, riskLevel: level, decision, factors, intentConsistency, explanation: summarize(decision, factors) };
}

function summarize(decision, factors) {
  if (decision === 'approve') return 'This payment matches your usual behaviour, so it was approved automatically.';
  const top = factors
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
        .map((f) => (/^(Amount|Payment|Stated|Description)\b/.test(f.explanation) ? f.explanation.charAt(0).toLowerCase() + f.explanation.slice(1) : f.explanation));
  const why = top.length ? ` because ${top.join('; ')}` : '';
  const action = {
    verify: 'This payment needs a quick confirmation',
    strong_verify: 'This payment needs strong verification',
    hold: 'This payment is on hold and needs a manual review',
  }[decision];
  return `${action}${why}.`;
}

module.exports = { analyze, findKnownRecipient, inr };
