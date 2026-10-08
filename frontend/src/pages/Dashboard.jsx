import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { api } from '../api.js';
import RiskBadge, { DECISION_LABEL } from '../components/RiskBadge.jsx';

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const DECISION_COLORS = { approve: '#16a34a', verify: '#d97706', strong_verify: '#ea580c', hold: '#dc2626' };

export default function Dashboard({ refreshKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api.summary().then(setData).catch((e) => setError(e.message));
  }, [refreshKey, tick]);

  async function refund(t) {
    if (!window.confirm(`Refund ${inr(t.amount)} paid to ${t.recipient}?`)) return;
    try {
      await api.refund({ transactionId: t.id });
      setNotice({ type: 'success', text: `Refund issued for ${t.recipient}.` });
      setTick((x) => x + 1);
    } catch (e) {
      setNotice({ type: 'error', text: e.message });
    }
  }

  if (error) return <div className="alert error">{error}</div>;
  if (!data) return <p className="muted">Loading dashboard…</p>;
  const k = data.kpis;

  return (
    <div className="stack">
      {notice && (
        <div className={`alert ${notice.type}`} onClick={() => setNotice(null)}>
          {notice.text}
        </div>
      )}
      <div className="kpis">
        <Kpi label="Account safety score" value={`${k.safetyScore}/100`} />
        <Kpi label="Total payments" value={k.total} />
        <Kpi label="Low risk" value={k.low} color="#16a34a" />
        <Kpi label="Medium risk" value={k.medium} color="#d97706" />
        <Kpi label="High / critical" value={k.high + k.critical} color="#dc2626" />
        <Kpi label="Verification rate" value={`${k.verificationRate}%`} />
        <Kpi label="Completed volume" value={inr(k.completedVolume)} />
        <Kpi label="Held / in review" value={k.blocked} />
        <Kpi label="Refunded" value={k.refunded} />
      </div>

      {k.total === 0 && <div className="alert info">No payments yet. Go to “Make payment” and try one of the demo scenarios.</div>}

      <div className="grid2">
        <div className="card">
          <h3>Risk score over time</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="n" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Line type="monotone" dataKey="riskScore" stroke="#4f46e5" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3>Decisions</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.decisions.map((d) => ({ ...d, label: DECISION_LABEL[d.name] }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value">
                {data.decisions.map((d) => (
                  <Cell key={d.name} fill={DECISION_COLORS[d.name]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h3>Risk alerts</h3>
        {data.alerts.length === 0 ? (
          <p className="muted">No alerts.</p>
        ) : (
          data.alerts.map((t) => (
            <div key={t.id} className="alert-row">
              <RiskBadge level={t.riskLevel} decision={t.decision} />
              <div>
                <strong>
                  {t.recipient} · {inr(t.amount)}
                </strong>
                <div className="muted small">{t.explanation}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h3>Recent payments</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Amount</th>
                <th>Risk</th>
                <th>Decision</th>
                <th>Status</th>
                <th>PayPal</th>
                <th>When</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((t) => (
                <tr key={t.id}>
                  <td>{t.recipient}</td>
                  <td>{inr(t.amount)}</td>
                  <td>{t.riskScore}</td>
                  <td>
                    <RiskBadge level={t.riskLevel} decision={t.decision} />
                  </td>
                  <td>{t.status.replace('_', ' ')}</td>
                  <td className="small">
                    {t.paypalCaptureId ? (
                      <span title={t.paypalCaptureId}>
                        {t.paymentMode === 'simulated' ? 'simulated' : t.paypalCaptureId.slice(0, 10)}
                        {t.webhookConfirmed ? ' ✔ webhook' : ''}
                      </span>
                    ) : (
                      '–'
                    )}
                  </td>
                  <td>{new Date(t.createdAt).toLocaleString()}</td>
                  <td>
                    {t.status === 'completed' && (
                      <button className="btn small" onClick={() => refund(t)}>
                        Refund
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, color }) {
  return (
    <div className="kpi">
      <div className="kpi-value" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="muted small">{label}</div>
    </div>
  );
}
