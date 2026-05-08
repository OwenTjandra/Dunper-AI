const { google } = require('googleapis');
const {
  getGoogleConnection,
  saveGoogleConnection,
  updateGoogleTokens,
  setGoogleSelection,
  clearGoogleConnection,
} = require('../db');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'openid',
  'email',
];

const BOOKINGS_TAB = 'Bookings';
const CUSTOMERS_TAB = 'Customers';
const BOOKINGS_HEADER = ['Booked At', 'Service', 'Customer', 'Phone', 'Date', 'Time', 'Duration (min)', 'Status', 'Calendar Event'];
const CUSTOMERS_HEADER = ['First Seen', 'Last Seen', 'Name', 'Phone', 'Notes', 'Messages', 'Intent', 'Sentiment', 'Summary'];

function configError() {
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID) return 'GOOGLE_OAUTH_CLIENT_ID not set in .env';
  if (!process.env.GOOGLE_OAUTH_CLIENT_SECRET) return 'GOOGLE_OAUTH_CLIENT_SECRET not set in .env';
  if (!process.env.GOOGLE_OAUTH_REDIRECT_URI) return 'GOOGLE_OAUTH_REDIRECT_URI not set in .env';
  return null;
}

function newOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  );
}

function getAuthUrl(state) {
  const client = newOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });
}

async function exchangeCode(code, user) {
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  let email = null;
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const profile = await oauth2.userinfo.get();
    email = profile.data.email;
  } catch (err) {
    console.warn('[Google OAuth] failed to fetch user email:', err.message);
  }

  return saveGoogleConnection({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(tokens.expiry_date || Date.now() + 3600 * 1000).toISOString(),
    scopes: (tokens.scope || SCOPES.join(' ')),
    email,
    user,
  });
}

function authorizedClient() {
  const conn = getGoogleConnection();
  if (!conn) return null;

  const client = newOAuthClient();
  client.setCredentials({
    access_token: conn.access_token,
    refresh_token: conn.refresh_token,
    expiry_date: new Date(conn.expires_at).getTime(),
    scope: conn.scopes,
  });
  client.on('tokens', (tokens) => {
    if (tokens.access_token) {
      updateGoogleTokens({
        accessToken: tokens.access_token,
        expiresAt: new Date(tokens.expiry_date || Date.now() + 3600 * 1000).toISOString(),
      });
    }
  });
  return client;
}

async function disconnect() {
  const client = authorizedClient();
  if (client) {
    try { await client.revokeCredentials(); } catch (err) {
      console.warn('[Google OAuth] revoke failed (clearing anyway):', err.message);
    }
  }
  clearGoogleConnection();
}

function status() {
  const cfg = configError();
  const conn = getGoogleConnection();
  return {
    configError: cfg,
    connected: Boolean(conn),
    email: conn?.email || null,
    calendarId: conn?.calendar_id || null,
    sheetId: conn?.sheet_id || null,
    connectedAt: conn?.connected_at || null,
    connectedBy: conn?.connected_by_username || null,
  };
}

function isCalendarSelected() {
  const conn = getGoogleConnection();
  return Boolean(conn?.calendar_id);
}

function isSheetSelected() {
  const conn = getGoogleConnection();
  return Boolean(conn?.sheet_id);
}

async function listCalendars() {
  const auth = authorizedClient();
  if (!auth) throw new Error('Google not connected');
  const cal = google.calendar({ version: 'v3', auth });
  const res = await cal.calendarList.list({ maxResults: 100 });
  return (res.data.items || []).map(c => ({
    id: c.id,
    summary: c.summary,
    primary: !!c.primary,
    accessRole: c.accessRole,
  }));
}

async function listSheets() {
  const auth = authorizedClient();
  if (!auth) throw new Error('Google not connected');
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: 'files(id, name, modifiedTime, webViewLink)',
    pageSize: 100,
    orderBy: 'modifiedTime desc',
  });
  return (res.data.files || []).map(f => ({
    id: f.id,
    name: f.name,
    modifiedAt: f.modifiedTime,
    url: f.webViewLink,
  }));
}

async function createSheet(title) {
  const auth = authorizedClient();
  if (!auth) throw new Error('Google not connected');
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.create({
    requestBody: { properties: { title: title || 'Frontdesk Bookings' } },
  });
  return {
    id: res.data.spreadsheetId,
    name: res.data.properties.title,
    url: res.data.spreadsheetUrl,
  };
}

function selectCalendar(calendarId) {
  return setGoogleSelection({ calendarId });
}

function selectSheet(sheetId) {
  return setGoogleSelection({ sheetId });
}

async function createCalendarEvent(booking, business) {
  const conn = getGoogleConnection();
  if (!conn?.calendar_id) return { skipped: true, reason: 'No calendar selected' };
  try {
    const auth = authorizedClient();
    const cal = google.calendar({ version: 'v3', auth });
    const summary = `${booking.service_name} — ${booking.customer_name}`;
    const description = [
      `Customer: ${booking.customer_name}`,
      `Phone: ${booking.customer_phone}`,
      `Service: ${booking.service_name} (${booking.duration_minutes} min)`,
      booking.notes ? `Notes: ${booking.notes}` : null,
      `Booked via ${business.name} frontdesk chatbot`,
    ].filter(Boolean).join('\n');

    const res = await cal.events.insert({
      calendarId: conn.calendar_id,
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

function columnLetter(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function ensureSheetTab(sheets, spreadsheetId, tabName, headerRow) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets.some(s => s.properties.title === tabName);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headerRow] },
    });
    return;
  }

  const headerCheck = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A1:${columnLetter(headerRow.length)}1`,
  });
  if (!headerCheck.data.values || headerCheck.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headerRow] },
    });
  }
}

async function appendBookingRow(booking, calendarLink) {
  const conn = getGoogleConnection();
  if (!conn?.sheet_id) return { skipped: true, reason: 'No sheet selected' };
  try {
    const auth = authorizedClient();
    const sheets = google.sheets({ version: 'v4', auth });
    await ensureSheetTab(sheets, conn.sheet_id, BOOKINGS_TAB, BOOKINGS_HEADER);
    const start = new Date(booking.starts_at);
    const dateStr = start.toLocaleDateString('en-CA');
    const timeStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    await sheets.spreadsheets.values.append({
      spreadsheetId: conn.sheet_id,
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
  const conn = getGoogleConnection();
  if (!conn?.sheet_id) return { skipped: true, reason: 'No sheet selected' };
  try {
    const auth = authorizedClient();
    const sheets = google.sheets({ version: 'v4', auth });
    await ensureSheetTab(sheets, conn.sheet_id, CUSTOMERS_TAB, CUSTOMERS_HEADER);

    const idColumn = await sheets.spreadsheets.values.get({
      spreadsheetId: conn.sheet_id,
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
        spreadsheetId: conn.sheet_id,
        range: `${CUSTOMERS_TAB}!A${targetRow}:I${targetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [row] },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: conn.sheet_id,
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
  configError,
  isCalendarEnabled: isCalendarSelected,
  isSheetsEnabled: isSheetSelected,
  getAuthUrl,
  exchangeCode,
  disconnect,
  listCalendars,
  listSheets,
  createSheet,
  selectCalendar,
  selectSheet,
  createCalendarEvent,
  appendBookingRow,
  upsertCustomerRow,
};
