# Risk model

Score = min(100, sum of factor scores). Defaults (see `backend/config/riskConfig.js`):

| Factor | Points |
|---|---|
| Amount ≤1.5x / ≤3x / ≤6x / ≤10x / >10x user average | 0 / 12 / 25 / 35 / 40 |
| New recipient | 25 |
| Unusual location | 10 |
| Untrusted device | 15 |
| Intent mismatch (per issue, max 20) | 10 |
| Intent confidence below 0.6 / below 0.4 | 5 / 10 |
| Scam-like wording | 20 |

Intent mismatch issues: description amount differs from the entered amount, description names a different recipient, or the recipient is normally paid for a different category.

Ideas to extend: velocity checks (many payments in a short time), time-of-day anomalies, per-recipient amount baselines, a learned model trained on labelled transactions (keep the rule engine as the explainable fallback).

Keep a dated private log of the problem, existing approaches, your mechanism, and experiments if you plan to explore a patent; get a prior-art search and professional IP advice before assuming anything is patentable.
