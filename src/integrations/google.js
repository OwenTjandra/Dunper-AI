const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const BOOKINGS_TAB = 'Bookings';
const CUSTOMERS_TAB = 'Customers';

const BOOKINGS_HEADER = ['Booked At', 'Service', 'Customer', 'Phone', 'Date', 'Time', 'Duration (min)', 'Status', 'Calendar Event'];
const CUSTOMERS_HEADER = ['First Seen', 'Last Seen', 'Name', 'Phone', 'Notes', 'Messages', 'Intent', 'Sentiment', 'Summary'];

let cachedAuth = null;
let cachedClientEmail = null;
let configError = null;

function configure() {
  configError = null;
  cachedAuth = null;
  cachedClientEmail = null;

  const credPath = process.env.GOOGLE_CREDENTIALS_PATH;
  if (!credPath) {
    configError = 'GOOGLE_CREDENTIALS_PATH not set';
    return;
  }
  const absolute = path.isAbsolute(credPath) ? credPath : path.join(__dirname, '../..', credPath);
  if (!fs.existsSync(absolute)) {
    configError = `Service-account JSON not found at ${absolute}`;
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (err) {
    configError = `Service-account JSON parse error: ${err.message}`;
    return;
  }

  cachedClientEmail = parsed.client_email;
  cachedAuth = new google.auth.GoogleAuth({
    keyFile: absolute,
    scopes: [CALENDAR_SCOPE, SHEETS_SCOPE],
  });
}

configure();

function isCalendarEnabled() {
  return Boolean(cachedAuth && process.env.GOOGLE_CALENDAR_ID);
}

function isSheetsEnabled() {
  return Boolean(cachedAuth && process.env.GOOGLE_SHEET_ID);
}

function status() {
  return {
    serviceAccountEmail: cachedClientEmail,
    calendarConnected: isCalendarEnabled(),
    sheetsConnected: isSheetsEnabled(),
    calendarId: process.env.GOOGLE_CALENDAR_ID || null,
    sheetId: process.env.GOOGLE_SHEET_ID || null,
    configError,
  };
}

async function calendarClient() {
  return google.calendar({ version: 'v3', auth: cachedAuth });
}

async function sheetsClient() {
  return google.sheets({ version: 'v4', auth: cachedAuth });
}

async function createCalendarEvent(booking, business) {
  if (!isCalendarEnabled()) return { skipped: true, reason: 'Calendar not configured' };
  try {
    const cal = await calendarClient();
    const summary = `${booking.service_name} — ${booking.customer_name}`;
    const description = [
      `Customer: ${booking.customer_name}`,
      `Phone: ${booking.customer_phone}`,
      `Service: ${booking.service_name} (${booking.duration_minutes} min)`,
      booking.notes ? `Notes: ${booking.notes}` : null,
      `Booked via ${business.name} frontdesk chatbot`,
    ].filter(Boolean).join('\n');

    const res = await cal.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      requestBody: {
        summary,
        description,
        start: { dateTime: booking.starts_at },
        end: { dateTime: booking.ends_at },
      },
    });
    return { ok: true, eventId: res.data.id, htmlLink: res.data.htmlLink };
  } catch (err) {
    console.error('[Google Calendar] create event failed:', err.message);
    return { ok: false, error: err.message };
  }
}

async function ensureSheetTab(tabName, headerRow) {
  const sheets = await sheetsClient();
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const exists = meta.data.sheets.some(s => s.properties.title === tabName);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headerRow] },
    });
    return;
  }

  const headerCheck = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A1:${columnLetter(headerRow.length)}1`,
  });
  if (!headerCheck.data.values || headerCheck.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headerRow] },
    });
  }
}

function columnLetter(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function appendBookingRow(booking, calendarLink) {
  if (!isSheetsEnabled()) return { skipped: true };
  try {
    const sheets = await sheetsClient();
    await ensureSheetTab(BOOKINGS_TAB, BOOKINGS_HEADER);
    const start = new Date(booking.starts_at);
    const dateStr = start.toLocaleDateString('en-CA');
    const timeStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${BOOKINGS_TAB}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          new Date().toISOString(),
          booking.service_name,
          booking.customer_name,
          booking.customer_phone,
          dateStr,
          timeStr,
          booking.duration_minutes,
          booking.status,
          calendarLink || '',
        ]],
      },
    });
    return { ok: true };
  } catch (err) {
    console.error('[Google Sheets] append booking failed:', err.message);
    return { ok: false, error: err.message };
  }
}

async function upsertCustomerRow(profile, summary) {
  if (!isSheetsEnabled()) return { skipped: true };
  try {
    const sheets = await sheetsClient();
    await ensureSheetTab(CUSTOMERS_TAB, CUSTOMERS_HEADER);

    const sheetId = process.env.GOOGLE_SHEET_ID;
    const idColumn = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${CUSTOMERS_TAB}!D2:D`,
    });

    const rows = idColumn.data.values || [];
    const matchIndex = rows.findIndex(r => (r?.[0] || '').trim() === (profile.phone || '').trim() && profile.phone);

    const row = [
      profile.created_at,
      profile.last_seen_at,
      profile.name || '',
      profile.phone || '',
      profile.notes || '',
      profile.message_count ?? '',
      summary?.intent || '',
      summary?.sentiment || '',
      summary?.summary || '',
    ];

    if (matchIndex >= 0) {
      const targetRow = matchIndex + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${CUSTOMERS_TAB}!A${targetRow}:I${targetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [row] },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: `${CUSTOMERS_TAB}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [row] },
      });
    }
    return { ok: true };
  } catch (err) {
    console.error('[Google Sheets] upsert customer failed:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  status,
  isCalendarEnabled,
  isSheetsEnabled,
  createCalendarEvent,
  appendBookingRow,
  upsertCustomerRow,
};
