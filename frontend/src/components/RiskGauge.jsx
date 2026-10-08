import { LEVEL_COLOR } from './RiskBadge.jsx';

export default function RiskGauge({ score, level }) {
  return (
    <div className="gauge">
      <div className="gauge-head">
        <span className="gauge-score" style={{ color: LEVEL_COLOR[level] }}>
          {score}
        </span>
        <span className="muted">/ 100 &nbsp;·&nbsp; {level} risk</span>
      </div>
      <div className="gauge-track">
        <div className="gauge-fill" style={{ width: `${score}%`, background: LEVEL_COLOR[level] }} />
      </div>
    </div>
  );
}
