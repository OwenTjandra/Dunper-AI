/* Mailer — sends 2FA codes via SMTP if configured, otherwise prints to
 * the server console so the dev flow works end-to-end without SMTP.
 *
 * To enable real email delivery, set these in .env:
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_USER=your-gmail@gmail.com
 *   SMTP_PASS=app-password-from-google-account-settings
 *   SMTP_FROM=Dunper AI <your-gmail@gmail.com>
 *
 * Gmail requires an "App Password" (not your regular password) — generate
 * one at https://myaccount.google.com/apppasswords (2FA must be on for
 * your Gmail account first).
 */

const nodemailer = require('nodemailer');

let transporter = null;
let mailerMode = 'console';

function init() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    mailerMode = 'console';
    console.log('[mailer] SMTP not configured — 2FA codes will print to console.');
    return;
  }
  try {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    mailerMode = 'smtp';
    console.log(`[mailer] SMTP transport ready (${SMTP_HOST}:${SMTP_PORT || 587}).`);
  } catch (e) {
    console.warn('[mailer] Failed to init SMTP, falling back to console:', e.message);
    mailerMode = 'console';
  }
}

async function sendLoginCode(email, code, username) {
  const subject = `Dunper sign-in code: ${code}`;
  const text =
`Hi ${username || ''},

Your Dunper sign-in code is: ${code}

It expires in 10 minutes. If you didn't request this, you can ignore
this email — nothing happened to your account.

— Dunper AI`;

  const html = `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1916;">
      <div style="font-family:'DM Serif Display',Georgia,serif;font-size:22px;letter-spacing:-0.3px;margin-bottom:6px;">Your Dunper sign-in code</div>
      <p style="color:#6b6966;margin-bottom:18px;">Use the code below to finish signing in. It expires in 10 minutes.</p>
      <div style="font-family:monospace;font-size:32px;letter-spacing:6px;background:#fafaf9;border:1px solid #e8e6e1;border-radius:12px;padding:18px;text-align:center;color:#e8334a;font-weight:700;">${code}</div>
      <p style="color:#9c9a94;font-size:12px;margin-top:18px;">If you didn't request this, you can ignore this email — your account is safe.</p>
      <p style="color:#9c9a94;font-size:12px;margin-top:4px;">— Dunper AI</p>
    </div>`;

  if (mailerMode !== 'smtp' || !transporter) {
    console.log('\n===== 2FA CODE (console fallback) =====');
    console.log(`  To:      ${email}`);
    console.log(`  User:    ${username || '(unknown)'}`);
    console.log(`  Code:    ${code}`);
    console.log(`  Expires: 10 minutes`);
    console.log('========================================\n');
    return { ok: true, mode: 'console' };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  try {
    const info = await transporter.sendMail({ from, to: email, subject, text, html });
    console.log(`[mailer] Sent 2FA code to ${email} (messageId: ${info.messageId})`);
    return { ok: true, mode: 'smtp', messageId: info.messageId };
  } catch (e) {
    console.error('[mailer] sendMail failed:', e.message);
    // Fall back to console so the flow still works for the user
    console.log(`[mailer] Falling back to console — code for ${email}: ${code}`);
    return { ok: true, mode: 'console-fallback', error: e.message };
  }
}

function generateCode() {
  // 6-digit numeric code, leading zeros allowed
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
}

function emailHint(email) {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!local || !domain) return null;
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`;
}

init();

module.exports = { sendLoginCode, generateCode, emailHint };
