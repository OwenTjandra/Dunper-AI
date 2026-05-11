const crypto = require('crypto');

const GRAPH_VERSION = 'v21.0';
const MAX_MESSAGE_CHARS = 3900;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function isConfigured() {
  return Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_ACCESS_TOKEN &&
    process.env.WHATSAPP_VERIFY_TOKEN
  );
}

function status() {
  return {
    configured: isConfigured(),
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
    verifyTokenSet: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
    accessTokenSet: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
    appSecretSet: Boolean(process.env.WHATSAPP_APP_SECRET),
  };
}

function verifyWebhookHandshake(query) {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return { ok: true, challenge };
  }
  return { ok: false };
}

function verifySignature(rawBody, signatureHeader) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    // In production, refuse to accept unsigned WhatsApp webhooks. Without
    // the app secret anyone who guesses the URL can trigger Claude calls,
    // burning the API budget and writing into customer profiles.
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, reason: 'app secret not configured (refusing in production)' };
    }
    return { ok: true, skipped: true };
  }
  if (!signatureHeader) return { ok: false, reason: 'missing signature header' };

  const expected = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice(7)
    : signatureHeader;
  const computed = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');

  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(computed, 'hex');
    if (a.length !== b.length) return { ok: false, reason: 'signature length mismatch' };
    return crypto.timingSafeEqual(a, b)
      ? { ok: true }
      : { ok: false, reason: 'signature mismatch' };
  } catch {
    return { ok: false, reason: 'signature parse error' };
  }
}

function parseInbound(payload) {
  const messages = [];
  const entries = payload?.entry || [];
  for (const entry of entries) {
    const changes = entry?.changes || [];
    for (const change of changes) {
      const value = change?.value;
      if (!value) continue;
      const businessPhoneNumberId = value.metadata?.phone_number_id || null;
      const messageList = value.messages || [];
      for (const msg of messageList) {
        if (msg.type !== 'text') {
          messages.push({
            kind: 'unsupported',
            from: msg.from,
            messageType: msg.type,
            messageId: msg.id,
            businessPhoneNumberId,
          });
          continue;
        }
        messages.push({
          kind: 'text',
          from: msg.from,
          text: msg.text?.body || '',
          messageId: msg.id,
          timestamp: msg.timestamp,
          businessPhoneNumberId,
        });
      }
    }
  }
  return messages;
}

async function sendText(toPhone, text) {
  if (!isConfigured()) return { skipped: true, reason: 'WhatsApp not configured' };
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toPhone,
    type: 'text',
    text: { preview_url: false, body: truncate(text) },
  };
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await postJson(url, body);
    if (result.ok) return result;
    lastError = result;
    if (!result.retryable || attempt === 2) break;
    await delay(result.retryAfterMs || 250 * Math.pow(2, attempt));
  }
  return lastError || { ok: false, error: 'Unknown WhatsApp send failure' };
}

async function postJson(url, body) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const retryAfter = Number(res.headers.get('retry-after'));
      return {
        ok: false,
        status: res.status,
        retryable: RETRYABLE_STATUS.has(res.status),
        retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null,
        error: data?.error?.message || `HTTP ${res.status}`,
        raw: data,
      };
    }
    return { ok: true, raw: data };
  } catch (err) {
    return { ok: false, retryable: true, error: err.message };
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function truncate(text) {
  if (!text) return '';
  if (text.length <= MAX_MESSAGE_CHARS) return text;
  return text.slice(0, MAX_MESSAGE_CHARS - 1) + '…';
}

function sessionIdForPhone(phone) {
  return `wa:${phone}`;
}

module.exports = {
  isConfigured,
  status,
  verifyWebhookHandshake,
  verifySignature,
  parseInbound,
  sendText,
  sessionIdForPhone,
};
