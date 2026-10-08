import { useState } from 'react';
import { api } from '../api.js';
import RiskBadge from '../components/RiskBadge.jsx';
import RiskGauge from '../components/RiskGauge.jsx';

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

const DEVICES = [
  { value: 'macbook-demo', label: 'Trusted MacBook' },
  { value: 'unknown-device-77', label: 'Unknown device' },
];
const LOCATIONS = [
  { value: 'Pune', label: 'Pune (usual)' },
  { value: 'Moscow', label: 'Moscow (unusual)' },
];

const PRESETS = [
  { name: '1 · Normal', recipient: 'Amazon India', amount: '2000', purpose: 'Monthly shopping', description: '', deviceId: 'macbook-demo', location: 'Pune' },
  { name: '2 · Unusual amount', recipient: 'Rahul Sharma', amount: '70000', purpose: 'Family support', description: 'Sending money to Rahul for family expenses', deviceId: 'macbook-demo', location: 'Pune' },
  { name: '3 · New recipient', recipient: 'ABC Electronics', amount: '50000', purpose: 'Laptop purchase', description: 'I am paying ₹50,000 to ABC Electronics for a laptop', deviceId: 'macbook-demo', location: 'Pune' },
  { name: '4 · Multiple anomalies', recipient: 'Quick Rewards Ltd', amount: '150000', purpose: 'Fee', description: 'Urgent! Pay ₹1,50,000 processing fee to claim my lottery prize', deviceId: 'unknown-device-77', location: 'Moscow' },
];

const EMPTY = { recipient: '', amount: '', purpose: '', description: '', deviceId: 'macbook-demo', location: 'Pune' };

export default function Pay({ onDone }) {
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState('form'); // form | analysis | result
  const [txn, setTxn] = useState(null);
  const [demoOtp, setDemoOtp] = useState(null);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function reset() {
    setForm(EMPTY);
    setStep('form');
    setTxn(null);
    setDemoOtp(null);
    setOtp('');
    setError('');
  }

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const analyze = (e) =>
    e.preventDefault() ||
    run(async () => {
      const res = await api.analyze({
        recipient: form.recipient,
        amount: Number(form.amount),
        purpose: form.purpose,
        description: form.description,
        context: { deviceId: form.deviceId, location: form.location },
      });
      setTxn(res.transaction);
      setDemoOtp(res.demoOtp || null);
      setStep('analysis');
    });

  async function execute(id) {
    const res = await api.execute({ transactionId: id });
    if (res.approveUrl) {
      window.location.href = res.approveUrl; // PayPal Sandbox approval, returns to /?paypal=return
      return;
    }
    setTxn(res.transaction);
    setStep('result');
    onDone();
  }

  const payNow = () => run(() => execute(txn.id));
  const confirmAndPay = () =>
    run(async () => {
      await api.verify({ transactionId: txn.id, method: 'confirm' });
      await execute(txn.id);
    });
  const otpAndPay = () =>
    run(async () => {
      await api.verify({ transactionId: txn.id, method: 'otp', otp });
      await execute(txn.id);
    });
  const requestReview = () =>
    run(async () => {
      const res = await api.verify({ transactionId: txn.id, method: 'review' });
      setTxn(res.transaction);
      setStep('result');
      onDone();
    });
  const cancel = () =>
    run(async () => {
      await api.cancel({ transactionId: txn.id });
      onDone();
      reset();
    });

  if (step === 'form') {
    return (
      <div className="card narrow">
        <h2>Send payment</h2>
        <div className="presets">
          <span className="muted small">Demo scenarios:</span>
          {PRESETS.map((p) => (
            <button key={p.name} type="button" className="btn small" onClick={() => setForm({ ...p })}>
              {p.name}
            </button>
          ))}
        </div>
        <form onSubmit={analyze}>
          <label>Recipient</label>
          <input value={form.recipient} onChange={set('recipient')} placeholder="e.g. ABC Electronics" required />
          <label>Amount (₹)</label>
          <input type="number" min="1" step="0.01" value={form.amount} onChange={set('amount')} placeholder="45000" required />
          <label>Purpose</label>
          <input value={form.purpose} onChange={set('purpose')} placeholder="e.g. Laptop purchase" required />
          <label>
            Describe it in your own words <span className="muted">(optional, the AI reads this)</span>
          </label>
          <textarea rows="3" value={form.description} onChange={set('description')} placeholder="I am paying ₹30,000 to Rahul for the laptop I purchased." />
          <fieldset>
            <legend>Demo simulation (a real system detects these automatically)</legend>
            <div className="row">
              <div>
                <label>Device</label>
                <select value={form.deviceId} onChange={set('deviceId')}>
                  {DEVICES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Location</label>
                <select value={form.location} onChange={set('location')}>
                  {LOCATIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </fieldset>
          {error && <div className="alert error">{error}</div>}
          <button className="btn primary" disabled={busy}>
            {busy ? 'Analyzing…' : 'Analyze payment'}
          </button>
        </form>
      </div>
    );
  }

  if (step === 'analysis' && txn) {
    return (
      <div className="card narrow">
        <h2>Payment analysis</h2>
        <p>
          <strong>{txn.recipient}</strong> · {inr(txn.amount)} · {txn.purpose}
        </p>
        <RiskGauge score={txn.riskScore} level={txn.riskLevel} />
        <p>
          <RiskBadge level={txn.riskLevel} decision={txn.decision} /> <span className="muted small">Intent: {txn.intent?.category} · consistency {txn.intentConsistency} · via {txn.intent?.source}</span>
        </p>
        <div className={`alert ${txn.decision === 'approve' ? 'success' : txn.decision === 'hold' ? 'error' : 'warn'}`}>{txn.explanation}</div>

        <h4>Why this score</h4>
        <ul className="factors">
          {txn.factors.map((f) => (
            <li key={f.factor}>
              <span className={f.score > 0 ? 'dot warn' : 'dot ok'}>{f.score > 0 ? '⚠' : '✓'}</span>
              <span>
                <strong>{f.factor}</strong> {f.score > 0 && <span className="muted">(+{f.score})</span>}
                <div className="muted small">{f.explanation}</div>
              </span>
            </li>
          ))}
        </ul>

        {txn.decision === 'strong_verify' && (
          <div className="verify-box">
            <label>Enter the 6-digit one-time code</label>
            <input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456" />
            {demoOtp && <p className="muted small">Demo mode: your code is <strong>{demoOtp}</strong> (a real app would send it by SMS or email).</p>}
          </div>
        )}

        {error && <div className="alert error">{error}</div>}
        <div className="actions">
          {txn.decision === 'approve' && (
            <button className="btn primary" onClick={payNow} disabled={busy}>
              Pay with PayPal
            </button>
          )}
          {txn.decision === 'verify' && (
            <button className="btn primary" onClick={confirmAndPay} disabled={busy}>
              Yes, it's me — pay with PayPal
            </button>
          )}
          {txn.decision === 'strong_verify' && (
            <button className="btn primary" onClick={otpAndPay} disabled={busy || otp.length !== 6}>
              Verify &amp; pay with PayPal
            </button>
          )}
          {txn.decision === 'hold' && (
            <button className="btn primary" onClick={requestReview} disabled={busy}>
              Request manual review
            </button>
          )}
          <button className="btn" onClick={cancel} disabled={busy}>
            Cancel payment
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card narrow">
      <h2>{txn?.status === 'completed' ? '✅ Transaction protected successfully' : txn?.status === 'under_review' ? '🟠 Sent for manual review' : 'Payment status'}</h2>
      <p>
        <strong>{txn?.recipient}</strong> · {inr(txn?.amount)}
      </p>
      <p>
        Status: <strong>{txn?.status?.replace('_', ' ')}</strong>
        {txn?.paymentMode === 'simulated' && <span className="muted"> (simulated: add PayPal Sandbox keys to send a real sandbox payment)</span>}
      </p>
      {txn?.paypalCaptureId && <p className="muted small">PayPal capture ID: {txn.paypalCaptureId}{txn.paypalPayerEmail ? ` · paid by ${txn.paypalPayerEmail}` : ''}</p>}
      <p>
        Risk {txn?.riskScore}/100 · <RiskBadge level={txn?.riskLevel} decision={txn?.decision} />
      </p>
      <button className="btn primary" onClick={reset}>
        New payment
      </button>
    </div>
  );
}
