const express = require('express');
const whatsapp = require('../integrations/whatsapp');

function createRouter({ webhookLimiter, handleWhatsAppPayload }) {
  const router = express.Router();

  router.get('/whatsapp', webhookLimiter, (req, res) => {
    const result = whatsapp.verifyWebhookHandshake(req.query);
    if (result.ok) return res.status(200).send(result.challenge);
    return res.status(403).send('Forbidden');
  });

  router.post('/whatsapp', webhookLimiter, async (req, res) => {
    const sig = req.get('x-hub-signature-256');
    const verified = whatsapp.verifySignature(req.rawBody || Buffer.alloc(0), sig);
    if (!verified.ok) {
      console.warn('[WhatsApp] webhook signature failed:', verified.reason);
      return res.status(401).send('bad signature');
    }
    res.status(200).send('OK');
    setImmediate(() => handleWhatsAppPayload(req.body).catch(err => {
      console.error('[WhatsApp] handler error:', err);
    }));
  });

  return router;
}

module.exports = { createRouter };
