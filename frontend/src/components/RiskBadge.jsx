export const DECISION_LABEL = {
  approve: 'Approved',
  verify: 'Verify',
  strong_verify: 'Strong verify',
  hold: 'On hold',
};

export const LEVEL_COLOR = { low: '#16a34a', medium: '#d97706', high: '#ea580c', critical: '#dc2626' };

export default function RiskBadge({ level, decision }) {
  return (
    <span className="badge" style={{ background: LEVEL_COLOR[level] || '#64748b' }}>
      {DECISION_LABEL[decision] || decision}
    </span>
  );
}
