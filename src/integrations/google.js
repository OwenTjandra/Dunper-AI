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
const BOOKINGS_HEADER = ['Booking At', 'Service', 'Customer Name', 'Phone Number', 'Email', 'Date', 'Time', 'Duration (min)', 'Status', 'Calendar Event'];
const BOOKINGS_STATUS_COL = 'I'; // 9th column = Status
const CUSTOMERS_HEADER = ['First Seen', 'Last Seen', 'Name', 'Phone', 'Email', 'Notes', 'Messages', 'Intent', 'Sentiment', 'Summary'];

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
  const spreadsheetId = res.data.spreadsheetId;

  // Pre-create both tabs with formatting, and drop the default "Sheet1"
  // so the spreadsheet looks ready-to-use the moment the owner opens it.
  await ensureSheetTab(sheets, spreadsheetId, BOOKINGS_TAB, BOOKINGS_HEADER);
  await ensureSheetTab(sheets, spreadsheetId, CUSTOMERS_TAB, CUSTOMERS_HEADER);
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const defaultSheet = meta.data.sheets.find(s => s.properties.title === 'Sheet1');
    if (defaultSheet) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ deleteSheet: { sheetId: defaultSheet.properties.sheetId } }] },
      });
    }
  } catch (err) {
    console.warn('[Google Sheets] could not delete default Sheet1:', err.message);
  }

  return {
    id: spreadsheetId,
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
      booking.customer_email ? `Email: ${booking.customer_email}` : null,
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

function shown(v) {
  if (v === null || v === undefined) return 'Not Given';
  const s = String(v).trim();
  return s ? s : 'Not Given';
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

async function applyTabFormatting(sheets, spreadsheetId, sheetId, headerCount) {
  // Step 1: layout (freeze, banding, header style, alignment) — banding may
  // throw if it already exists, so we run that as a separate optional step.
  const baseRequests = [
    // Header style
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.12, green: 0.16, blue: 0.22 },
            textFormat: {
              foregroundColor: { red: 1, green: 1, blue: 1 },
              bold: true,
              fontSize: 11,
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            padding: { top: 6, bottom: 6, left: 8, right: 8 },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)',
      },
    },
    // Center every data cell (rows 2+)
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            padding: { top: 4, bottom: 4, left: 8, right: 8 },
          },
        },
        fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,padding)',
      },
    },
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    {
      autoResizeDimensions: {
        dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: headerCount },
      },
    },
  ];
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: baseRequests } });

  // Step 2: banding — separate request, swallow "already exists" errors.
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addBanding: {
            bandedRange: {
              range: { sheetId, startRowIndex: 1 },
              rowProperties: {
                firstBandColor: { red: 1, green: 1, blue: 1 },
                secondBandColor: { red: 0.97, green: 0.98, blue: 0.99 },
              },
            },
          },
        }],
      },
    });
  } catch (err) {
    // Banding likely already present from a previous run — fine.
  }
}

async function reformatExistingTabs() {
  const conn = getGoogleConnection();
  if (!conn?.sheet_id) throw new Error('No sheet connected.');
  const auth = authorizedClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: conn.sheet_id });

  const targets = [
    { name: BOOKINGS_TAB, header: BOOKINGS_HEADER },
    { name: CUSTOMERS_TAB, header: CUSTOMERS_HEADER },
  ];
  const reformatted = [];
  for (const t of targets) {
    const tab = meta.data.sheets.find(s => s.properties.title === t.name);
    if (!tab) continue;
    // Rewrite the header row in case columns changed (e.g. Email added).
    await sheets.spreadsheets.values.update({
      spreadsheetId: conn.sheet_id,
      range: `${t.name}!A1:${columnLetter(t.header.length)}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [t.header] },
    });
    await applyTabFormatting(sheets, conn.sheet_id, tab.properties.sheetId, t.header.length);
    reformatted.push(t.name);
  }
  return { reformatted };
}

async function ensureSheetTab(sheets, spreadsheetId, tabName, headerRow) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets.find(s => s.properties.title === tabName);

  if (!existing) {
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
    });
    const newSheetId = addRes.data.replies[0].addSheet.properties.sheetId;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headerRow] },
    });
    await applyTabFormatting(sheets, spreadsheetId, newSheetId, headerRow.length);
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
    await applyTabFormatting(sheets, spreadsheetId, existing.properties.sheetId, headerRow.length);
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
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          new Date().toISOString(),
          shown(booking.service_name),
          shown(booking.customer_name),
          shown(booking.customer_phone),
          shown(booking.customer_email),
          dateStr,
          timeStr,
          booking.duration_minutes,
          shown(booking.status),
          calendarLink || 'Not Given',
        ]],
      },
    });
    return { ok: true };
  } catch (err) {
    console.error('[Google Sheets] append booking failed:', err.message);
    return { ok: false, error: err.message };
  }
}

async function updateBookingStatus(booking, newStatus) {
  const conn = getGoogleConnection();
  if (!conn?.sheet_id) return { skipped: true, reason: 'No sheet selected' };
  try {
    const auth = authorizedClient();
    const sheets = google.sheets({ version: 'v4', auth });
    // Match the row by composite (Phone Number + Date + Time) — these together
    // uniquely identify a booking (the slot logic forbids overlapping times).
    // Columns: D=Phone Number, F=Date, G=Time.
    const dataRange = `${BOOKINGS_TAB}!D2:G`;
    const cols = await sheets.spreadsheets.values.get({
      spreadsheetId: conn.sheet_id,
      range: dataRange,
    });
    const start = new Date(booking.starts_at);
    const targetDate = start.toLocaleDateString('en-CA');
    const targetTime = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const targetPhone = String(booking.customer_phone || '').trim();
    const rows = cols.data.values || [];
    const idx = rows.findIndex(r => {
      const phone = (r?.[0] || '').trim();
      const date = (r?.[2] || '').trim();
      const time = (r?.[3] || '').trim();
      return phone === targetPhone && date === targetDate && time === targetTime;
    });
    if (idx < 0) return { ok: false, reason: 'Matching row not found' };
    const targetRow = idx + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId: conn.sheet_id,
      range: `${BOOKINGS_TAB}!${BOOKINGS_STATUS_COL}${targetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[newStatus]] },
    });
    return { ok: true };
  } catch (err) {
    console.error('[Google Sheets] updateBookingStatus failed:', err.message);
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
      shown(profile.name),
      shown(profile.phone),
      shown(profile.email),
      shown(profile.notes),
      profile.message_count ?? 0,
      shown(summary?.intent),
      shown(summary?.sentiment),
      shown(summary?.summary),
    ];

    if (matchIndex >= 0) {
      const targetRow = matchIndex + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId: conn.sheet_id,
        range: `${CUSTOMERS_TAB}!A${targetRow}:J${targetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: conn.sheet_id,
        range: `${CUSTOMERS_TAB}!A1`,
        valueInputOption: 'RAW',
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
  updateBookingStatus,
  upsertCustomerRow,
  reformatExistingTabs,
};
