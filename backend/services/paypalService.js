// PayPal Orders v2 (Sandbox). Falls back to a clearly-labelled simulation when no credentials are set.
const crypto = require('crypto');

const base = () => process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';
const currency = () => process.env.PAYPAL_CURRENCY || 'USD';
const isConfigured = () => Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

let cached = { token: null, exp: 0 };

async function getToken() {
  if (cached.token && Date.now() < cached.exp) return cached.token;
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${base()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal auth failed: ${data.error_description || res.status}`);
  cached = { token: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 };
  return cached.token;
}

// Sandbox currency: PayPal sandbox generally does not accept INR for international accounts,
// so the INR amount is converted to PAYPAL_CURRENCY using INR_PER_USD.
function toPayPalAmount(amountInr) {
  const rate = Number(process.env.INR_PER_USD) || 83;
  return Math.max(0.01, amountInr / rate).toFixed(2);
}

async function createOrder(txn) {
  if (!isConfigured()) {
    return { simulated: true, orderId: `SIM-${crypto.randomUUID()}`, approveUrl: null };
  }
  const token = await getToken();
  const front = process.env.FRONTEND_URL || 'http://localhost:5173';
  const res = await fetch(`${base()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `payguard-${txn.id}`,
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: String(txn.id).slice(0, 120),
          description: `PayGuard payment to ${txn.recipient}`.slice(0, 127),
          amount: { currency_code: currency(), value: toPayPalAmount(txn.amount) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'PayGuard AI',
            user_action: 'PAY_NOW',
            return_url: `${front}/?paypal=return&txn=${txn.id}`,
            cancel_url: `${front}/?paypal=cancel&txn=${txn.id}`,
          },
        },
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal create order failed: ${data.message || res.status}`);
  const link = (data.links || []).find((l) => l.rel === 'payer-action' || l.rel === 'approve');
  return { simulated: false, orderId: data.id, approveUrl: link ? link.href : null };
}

async function captureOrder(orderId) {
  if (String(orderId).startsWith('SIM-')) {
    return { simulated: true, status: 'COMPLETED', captureId: `SIMCAP-${crypto.randomUUID()}`, payerEmail: null, fee: null, paidAmount: null, currency: null };
  }
  const token = await getToken();
  const res = await fetch(`${base()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal capture failed: ${data.message || res.status}`);
  const cap = data.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    simulated: false,
    status: data.status,
    captureId: cap ? cap.id : null,
    payerEmail: (data.payer && data.payer.email_address) || null,
    fee: (cap && cap.seller_receivable_breakdown && cap.seller_receivable_breakdown.paypal_fee && cap.seller_receivable_breakdown.paypal_fee.value) || null,
    paidAmount: (cap && cap.amount && cap.amount.value) || null,
    currency: (cap && cap.amount && cap.amount.currency_code) || null,
  };
}

// Full refund of a captured payment.
async function refundCapture(captureId) {
  if (String(captureId).startsWith('SIMCAP-')) {
    return { simulated: true, status: 'COMPLETED', refundId: `SIMREF-${crypto.randomUUID()}` };
  }
  const token = await getToken();
  const res = await fetch(`${base()}/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': `payguard-refund-${captureId}`,
    },
    body: '{}',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal refund failed: ${data.message || res.status}`);
  return { simulated: false, status: data.status, refundId: data.id };
}

// Verifies a webhook really came from PayPal (needs PAYPAL_WEBHOOK_ID).
async function verifyWebhook(headers, event) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!isConfigured() || !webhookId) return false;
  const token = await getToken();
  const res = await fetch(`${base()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: event,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok && data.verification_status === 'SUCCESS';
}

module.exports = { createOrder, captureOrder, refundCapture, verifyWebhook, isConfigured };
