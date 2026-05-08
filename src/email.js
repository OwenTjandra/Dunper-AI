const nodemailer = require('nodemailer');
const { recordOutboxEmail } = require('./db');
const { getBusiness } = require('./business');

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter !== null) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    cachedTransporter = false;
    return false;
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return cachedTransporter;
}

function fromAddress() {
  const business = getBusiness();
  const name = process.env.SMTP_FROM_NAME || business.name || 'Dunper AI';
  const addr = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!addr) return null;
  return `"${name}" <${addr}>`;
}

function formatBookingDate(booking) {
  const start = new Date(booking.starts_at);
  const dateStr = start.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return { dateStr, timeStr };
}

function buildBookingConfirmation(booking) {
  const business = getBusiness();
  const { dateStr, timeStr } = formatBookingDate(booking);

  const subject = `Appointment confirmed — ${business.name}`;

  const text = [
    `Hi ${booking.customer_name},`,
    '',
    `Your appointment at ${business.name} is confirmed.`,
    '',
    `Service: ${booking.service_name}`,
    `When:    ${dateStr} at ${timeStr}`,
    `Duration: ${booking.duration_minutes} minutes`,
    '',
    business.address ? `Address: ${business.address}` : '',
    business.phone ? `Questions? Call us at ${business.phone}` : '',
    '',
    `Thanks!`,
    `${business.name}`,
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; color: #1f2937;">
      <h2 style="color: #4338ca; margin-top: 0;">Appointment confirmed</h2>
      <p>Hi ${escapeHtml(booking.customer_name)},</p>
      <p>Your appointment at <strong>${escapeHtml(business.name)}</strong> is confirmed.</p>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <tr><td style="padding: 8px 0; color: #6b7280; width: 110px;">Service</td><td style="padding: 8px 0;"><strong>${escapeHtml(booking.service_name)}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">When</td><td style="padding: 8px 0;"><strong>${escapeHtml(dateStr)}</strong> at <strong>${escapeHtml(timeStr)}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Duration</td><td style="padding: 8px 0;">${booking.duration_minutes} minutes</td></tr>
      </table>
      ${business.address ? `<p style="color: #6b7280; font-size: 14px;">📍 ${escapeHtml(business.address)}</p>` : ''}
      ${business.phone ? `<p style="color: #6b7280; font-size: 14px;">Questions? Call us at <a href="tel:${escapeHtml(business.phone)}" style="color:#4338ca;">${escapeHtml(business.phone)}</a></p>` : ''}
      <p style="margin-top: 24px;">Thanks!<br/><em>${escapeHtml(business.name)}</em></p>
      <p style="font-size: 11px; color: #9ca3af; margin-top: 32px;">Powered by Dunper AI</p>
    </div>
  `;

  return { subject, text, html };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function sendBookingConfirmation(booking) {
  const to = booking.customer_email;
  if (!to || !/.+@.+/.test(to)) {
    return { skipped: true, reason: 'No customer email' };
  }

  const { subject, text, html } = buildBookingConfirmation(booking);
  const transporter = getTransporter();

  if (!transporter) {
    recordOutboxEmail({
      toAddress: to,
      subject,
      bodyText: text,
      bodyHtml: html,
      category: 'booking_confirmation',
      relatedId: booking.id,
      status: 'skipped_no_smtp',
    });
    return { skipped: true, reason: 'SMTP not configured' };
  }

  const from = fromAddress();
  if (!from) {
    recordOutboxEmail({
      toAddress: to, subject, bodyText: text, bodyHtml: html,
      category: 'booking_confirmation', relatedId: booking.id,
      status: 'failed', errorText: 'No SMTP_FROM configured',
    });
    return { ok: false, error: 'No SMTP_FROM configured' };
  }

  try {
    const info = await transporter.sendMail({ from, to, subject, text, html });
    recordOutboxEmail({
      toAddress: to, subject, bodyText: text, bodyHtml: html,
      category: 'booking_confirmation', relatedId: booking.id,
      status: 'sent', sentAt: new Date().toISOString(),
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error('[Email] sendBookingConfirmation failed:', err.message);
    recordOutboxEmail({
      toAddress: to, subject, bodyText: text, bodyHtml: html,
      category: 'booking_confirmation', relatedId: booking.id,
      status: 'failed', errorText: err.message,
    });
    return { ok: false, error: err.message };
  }
}

function status() {
  const transporter = getTransporter();
  return {
    configured: Boolean(transporter),
    fromConfigured: Boolean(process.env.SMTP_FROM || process.env.SMTP_USER),
  };
}

module.exports = { sendBookingConfirmation, status };
