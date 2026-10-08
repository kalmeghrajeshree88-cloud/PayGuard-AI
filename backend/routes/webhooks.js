// PayPal webhooks: lets PayPal tell the app what happened (capture completed, refunded, denied).
// Signature is verified with PayPal before anything is trusted.
const express = require('express');
const store = require('../store');
const paypal = require('../services/paypalService');

const router = express.Router();

router.post('/paypal', async (req, res, next) => {
  try {
    const event = req.body || {};
    if (!(await paypal.verifyWebhook(req.headers, event))) return res.status(400).json({ error: 'Invalid webhook signature' });

    const resource = event.resource || {};
    const related = (resource.supplementary_data && resource.supplementary_data.related_ids) || {};
    let txn = null;
    if (related.order_id) txn = await store.findTransaction({ paypalOrderId: related.order_id });
    if (!txn && (related.capture_id || resource.id)) txn = await store.findTransaction({ paypalCaptureId: related.capture_id || resource.id });

    if (txn) {
      const patch = { lastWebhookEvent: event.event_type, lastWebhookAt: new Date().toISOString() };
      if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') patch.webhookConfirmed = true;
      if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') patch.status = 'refunded';
      if (event.event_type === 'PAYMENT.CAPTURE.DENIED') patch.status = 'failed';
      await store.updateTransaction(txn.id, patch);
    }
    res.json({ received: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
