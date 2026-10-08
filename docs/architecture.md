# Architecture

1. **Analyze**: the client posts recipient, amount, purpose and an optional free-text description. The intent engine returns structured intent (recipient, amount, category, confidence, scam signals). The risk engine combines it with the user's profile (average amount, known recipients, usual locations, trusted devices) and returns a score, level, decision and per-factor explanations. A transaction is stored with status `analyzed` (or `held`).
2. **Verify**: depending on the decision the user confirms, enters a one-time code, or requests manual review. Status becomes `verified` or `under_review`.
3. **Execute**: the server refuses unless the decision is `approve` (status `analyzed`) or status is `verified`. It creates a PayPal order and returns the approval URL (or simulates when no keys are set).
4. **Capture**: after PayPal redirects back, the order is captured and the transaction becomes `completed`. The recipient is added to known recipients and the user's average amount is updated gradually.
5. **Dashboard**: aggregates transactions into KPIs, a risk timeline, decision counts and alerts.

Transaction statuses: `analyzed → verified → awaiting_paypal → completed`, or `held → under_review`, `cancelled`, `failed`.
