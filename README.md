# 🛡️ PayGuard AI — Adaptive Payment Risk & Intent Engine

User describes a payment → AI extracts the intent → a rule-based risk engine scores it → the system picks a verification level → PayPal Sandbox processes it → the dashboard records the result.

```
React (Vite) ──► Express API ──► Intent engine (LLM or rule-based)
                    │            Risk engine  (configurable rules)
                    │            PayPal Sandbox (Orders v2)
                    └──► MongoDB (or built-in in-memory store)
```

**The LLM never decides "safe". It only extracts structure. The deterministic risk engine decides.**

## Setup for judges (PayPal Sandbox + AI)

Requires Node 18+. Full run takes about 5 minutes.

1. `cd backend && cp .env.example .env`
2. Fill in `backend/.env`:
   - `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`: PayPal Developer → Apps & Credentials → **Sandbox** app.
   - `AI_API_KEY`: an Anthropic API key (used for payment-intent extraction).
   - `JWT_SECRET`: any long random string (`openssl rand -hex 32`).
3. `npm install && npm test && npm run dev` (backend, port 5000)
4. In a second terminal: `cd frontend && npm install && npm run dev`
5. Open http://localhost:5173, log in with **demo@payguard.ai / Demo@1234**.
6. Check http://localhost:5000/api/health shows `"ai":"llm"` and `"paypal":"sandbox"`.
7. Approve payments with a PayPal **Sandbox personal (buyer) account** (PayPal Developer → Testing Tools → Sandbox Accounts).

**Restart the backend after editing `.env`** (nodemon does not reload `.env` changes on its own).

## PayPal features used

- Orders v2: create order, buyer approval redirect, capture (payer email, fee and capture ID stored on the transaction)
- Refunds: reverse a completed payment from the dashboard
- Webhooks: signature-verified `PAYMENT.CAPTURE.*` events update the dashboard (set `PAYPAL_WEBHOOK_ID`; the URL must be public, e.g. Render or ngrok → `/api/webhooks/paypal`)

## Runs with zero setup

Everything has a fallback, so the project works the moment you install it:

| Piece | With keys | Without keys |
|---|---|---|
| Database | MongoDB (`MONGO_URI`) | In-memory store (resets on restart) |
| Intent AI | LLM (`AI_API_KEY`) | Rule-based parser |
| Payments | PayPal Sandbox | Simulated payment (clearly labelled) |

`GET /api/health` shows which mode is active.

## Quick start (macOS / Linux, Node 18+)

Terminal 1, backend:
```bash
cd backend
cp .env.example .env
npm install
npm test          # runs the 4 risk scenarios + intent parser checks
npm run dev       # http://localhost:5000
```

Terminal 2, frontend:
```bash
cd frontend
npm install
npm run dev       # http://localhost:5173
```

Open http://localhost:5173 and log in with **demo@payguard.ai / Demo@1234**.

## Demo scenarios (buttons on the payment screen)

| # | Scenario | Risk | Decision |
|---|---|---|---|
| 1 | ₹2,000 to Amazon India, trusted device | 0 | Approve |
| 2 | ₹70,000 to Rahul Sharma (known, but 23x usual amount) | 40 | Verify (one-click confirm) |
| 3 | ₹50,000 to ABC Electronics (new recipient) | 65 | Strong verify (one-time code) |
| 4 | ₹1,50,000, new recipient, unknown device, Moscow, scam wording | 100 | Hold (manual review) |

After a payment completes, the recipient becomes "known" and the user's average updates, so repeating scenario 3 becomes low risk. That's the adaptive part.

## Turn on the real pieces

**MongoDB**: create a free cluster on MongoDB Atlas and set `MONGO_URI` in `backend/.env`.

**AI intent**: set `AI_API_KEY` (an Anthropic API key) and optionally `AI_MODEL`. On any LLM error the rule-based parser takes over.

**PayPal Sandbox**
1. Go to developer.paypal.com → Apps & Credentials → Sandbox → *Create App*.
2. Copy Client ID and Secret into `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`.
3. Under Testing Tools → Sandbox Accounts, use the *Personal* (buyer) account to approve payments.
4. Restart the backend. "Pay with PayPal" now redirects to the sandbox approval page and returns to the app, which captures the payment.

PayPal Sandbox generally doesn't accept INR for international accounts, so amounts are converted to `PAYPAL_CURRENCY` (default USD) using `INR_PER_USD`. Never use real money or real credentials in development.

## Tuning the risk engine

All weights, thresholds and the score→decision mapping live in `backend/config/riskConfig.js`.

| Score | Level | Decision | User must |
|---|---|---|---|
| 0–30 | low | approve | nothing |
| 31–60 | medium | verify | confirm "it's me" |
| 61–80 | high | strong_verify | enter a one-time code |
| 81–100 | critical | hold | wait for manual review |

Factors: amount vs. user average, new recipient, unusual location, untrusted device, intent mismatch, low intent confidence, scam wording. Every factor returns a plain-English explanation shown in the UI.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login`, `/api/auth/register` | Authentication (JWT, bcrypt) |
| GET | `/api/auth/me` | Current user |
| POST | `/api/payments/analyze` | Parse intent, score risk, create transaction |
| POST | `/api/payments/verify` | Confirm / one-time code / request review |
| POST | `/api/payments/execute` | Create the PayPal order (only if approved or verified) |
| POST | `/api/payments/capture` | Capture after PayPal approval |
| POST | `/api/payments/refund` | Refund a completed payment |
| POST | `/api/payments/cancel` | Cancel |
| POST | `/api/webhooks/paypal` | PayPal webhook receiver (signature verified) |
| GET | `/api/payments` | Transaction history |
| GET | `/api/dashboard/summary` | KPIs and chart data |
| GET | `/api/risk/history` | Risk events |

## Security notes

Implemented: bcrypt password hashing, JWT auth (2h), input validation and sanitising, per-user ownership checks, rate limiting, helmet, CORS lock, `.env` for secrets (git-ignored), hashed one-time codes with expiry and attempt limits, execution blocked server-side unless approved/verified.

Demo shortcuts to replace before any real use: device and location come from the client (a real system derives them from device fingerprinting and IP), the one-time code is returned in the API response when `DEMO_MODE=true` (a real system sends it by SMS/email), and the in-memory store is not persistent.

## License

MIT, see `LICENSE`.

## Deploying

Frontend on Vercel (set `VITE_API_URL` to the backend URL), backend on Render or Railway (set the `.env` values there, `NODE_ENV=production`, `DEMO_MODE=false`, `FRONTEND_URL` to your Vercel URL), database on MongoDB Atlas.

## Project layout

```
backend/   server.js, config/riskConfig.js, services/{riskEngine,intentEngine,paypalService}.js,
           routes/, store/ (memory + MongoDB), middleware/auth.js, test/scenarios.js
frontend/  Vite + React: pages/{Login,Dashboard,Pay}.jsx, components/, api.js
docs/      architecture.md, risk-model.md
```
