/* Business Dashboard — minimal wire-up.
 *
 * Replaces the legacy form-based admin.js (preserved at admin.legacy.js)
 * which referenced ~50 DOM IDs that no longer exist in the new sidebar
 * layout. The legacy script crashed on line 7 trying to attach a click
 * handler to an element that didn't exist, taking the whole dashboard
 * down with it.
 *
 * This rewrite hits only the IDs that actually live in the new admin.html
 * (verified: greeting, kpi-*, upcoming-bookings-list, bookings-tbody,
 * customers-tbody, sm-*, alerts-bookings-list, alerts-chats-list,
 * dash-alerts-list, etc).
 */

// ===== auth helpers =====
function handleUnauthorized(res) {
  if (res.status === 401) { window.location.href = '/dunper_signin.html'; return true; }
  return false;
}

// ===== sidebar navigation (global — HTML uses onclick="navigate(this)") =====
window.navigate = function(el) {
  if (!el) return;
  const target = el.dataset.page;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n === el));
  document.querySelectorAll('[id^="page-"]').forEach(p => {
    p.style.display = (p.id === 'page-' + target) ? '' : 'none';
  });
  // Update header title (best-effort — element may be optional)
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = el.textContent.trim().replace(/^\s+/, '');
};

// ===== utils =====
function $(id) { return document.getElementById(id); }
function setText(id, val) { const el = $(id); if (el) el.textContent = String(val ?? '—'); }
function fmtDate(s) { if (!s) return ''; try { return new Date(s).toLocaleDateString(); } catch { return s; } }
function fmtTime(s) { if (!s) return ''; try { return new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return s; } }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ===== logout =====
function wireLogout() {
  const btn = $('logout-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
    window.location.href = '/dunper_signin.html';
  });
}

// ===== /api/metrics → KPI tiles + dashboard small-multiples =====
async function loadMetrics() {
  try {
    const r = await fetch('/api/metrics', { credentials: 'include' });
    if (handleUnauthorized(r)) return;
    if (!r.ok) return;
    const m = await r.json();

    // KPI hero tiles
    setText('kpi-bookings-today', m.todayBookings ?? 0);
    setText('kpi-conversations',  m.conversations ?? 0);
    setText('kpi-conversion-rate', (m.conversionRate ?? 0) + '%');
    setText('kpi-week-bookings',  m.weekBookings ?? 0);

    // Small-metrics block on the AI Settings / Profile pages
    setText('sm-total-convs',        m.conversations ?? 0);
    setText('sm-customer-msgs',      m.customerMessages ?? 0);
    setText('sm-confirmed-bookings', m.totalBookings ?? 0);
    setText('sm-month-bookings',     m.monthBookings ?? 0);
    setText('sm-conversion',         (m.conversionRate ?? 0) + '%');
    setText('sm-open-escalations',   m.openEscalations ?? 0);
    setText('sm-top-service',        m.topService || '—');

    // Alerts badge in sidebar (open escalations + open unanswered)
    const totalAlerts = (m.openEscalations || 0) + (m.openUnanswered || 0);
    const badge = $('alerts-badge');
    if (badge) {
      if (totalAlerts > 0) { badge.style.display = ''; badge.textContent = totalAlerts; }
      else { badge.style.display = 'none'; }
    }
  } catch (err) {
    console.warn('[dashboard] loadMetrics failed:', err.message);
  }
}

// ===== /api/bookings → upcoming list, today list, bookings table =====
async function loadBookings() {
  try {
    const r = await fetch('/api/bookings', { credentials: 'include' });
    if (handleUnauthorized(r)) return;
    if (!r.ok) return;
    const data = await r.json();
    const all = data.bookings || [];
    const now = new Date();

    // Upcoming bookings (next, status != cancelled)
    const upcoming = all
      .filter(b => b.status !== 'cancelled' && new Date(b.starts_at) >= now)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .slice(0, 8);
    renderUpcomingList('upcoming-bookings-list', upcoming);
    renderUpcomingList('alerts-bookings-list', upcoming.slice(0, 5));

    // Today's bookings (Calendar page + dashboard widgets)
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const dayEnd   = new Date(now); dayEnd.setHours(23, 59, 59, 999);
    const todays = all
      .filter(b => b.status !== 'cancelled')
      .filter(b => { const d = new Date(b.starts_at); return d >= dayStart && d <= dayEnd; })
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    renderUpcomingList('calendar-today-list', todays.length ? todays : upcoming.slice(0, 6));
    const calTitle = $('calendar-today-title');
    if (calTitle) calTitle.textContent = todays.length ? "Today's Bookings" : 'No bookings today — upcoming shown';

    // Full bookings table (page-metrics)
    renderBookingsTable('bookings-tbody', all.slice(0, 50));
  } catch (err) {
    console.warn('[dashboard] loadBookings failed:', err.message);
  }
}

function renderUpcomingList(elId, rows) {
  const el = $(elId);
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<div class="empty-state" style="padding:14px 4px;color:rgba(31,76,143,.45);font-size:13px;">No upcoming bookings.</div>';
    return;
  }
  el.innerHTML = rows.map(b => `
    <div class="upcoming-row" style="display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid rgba(31,76,143,.08);">
      <div style="font-family:'Outfit',sans-serif;font-weight:600;color:var(--accent,#2E78D4);min-width:64px;font-size:13px;">${escapeHtml(fmtTime(b.starts_at))}</div>
      <div>
        <div style="font-weight:500;font-size:14px;color:#0A1430;">${escapeHtml(b.customer_name || 'Unnamed')}</div>
        <div style="font-size:12px;color:#475569;">${escapeHtml(b.service_name || '—')} · ${escapeHtml(fmtDate(b.starts_at))}</div>
      </div>
      <div style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:.05em;">${escapeHtml(b.status || '')}</div>
    </div>
  `).join('');
}

function renderBookingsTable(elId, rows) {
  const el = $(elId);
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<tr><td colspan="5" style="padding:20px;text-align:center;color:#94A3B8;">No bookings yet.</td></tr>';
    return;
  }
  el.innerHTML = rows.map(b => `
    <tr>
      <td>${escapeHtml(b.customer_name || '—')}</td>
      <td>${escapeHtml(b.service_name || '—')}</td>
      <td>${escapeHtml(fmtDate(b.starts_at))} ${escapeHtml(fmtTime(b.starts_at))}</td>
      <td>${escapeHtml(b.customer_phone || '—')}</td>
      <td><span class="status-pill status-${escapeHtml(b.status)}">${escapeHtml(b.status || '')}</span></td>
    </tr>
  `).join('');
}

// ===== /api/profiles → customers table + chats sub-list =====
async function loadCustomers() {
  try {
    const r = await fetch('/api/profiles', { credentials: 'include' });
    if (handleUnauthorized(r)) return;
    if (!r.ok) return;
    const data = await r.json();
    const profiles = (data.profiles || []).slice(0, 50);
    renderCustomersTable('customers-tbody', profiles);
    renderChatsSubList('alerts-chats-list', profiles.slice(0, 5));
  } catch (err) {
    console.warn('[dashboard] loadCustomers failed:', err.message);
  }
}

function renderCustomersTable(elId, rows) {
  const el = $(elId);
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<tr><td colspan="5" style="padding:20px;text-align:center;color:#94A3B8;">No customers yet.</td></tr>';
    return;
  }
  el.innerHTML = rows.map(p => `
    <tr>
      <td>${escapeHtml(p.name || 'Unnamed')}</td>
      <td>${escapeHtml(p.phone || '—')}</td>
      <td>${escapeHtml(p.email || '—')}</td>
      <td>${p.message_count ?? 0}</td>
      <td>${escapeHtml(fmtDate(p.last_seen_at))}</td>
    </tr>
  `).join('');
}

function renderChatsSubList(elId, rows) {
  const el = $(elId);
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<div class="empty-state" style="padding:14px 4px;color:rgba(31,76,143,.45);font-size:13px;">No recent chats.</div>';
    return;
  }
  el.innerHTML = rows.map(p => `
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(31,76,143,.08);font-size:13px;">
      <span style="color:#0A1430;font-weight:500;">${escapeHtml(p.name || 'Anonymous')}</span>
      <span style="color:#475569;font-size:12px;">${escapeHtml(fmtDate(p.last_seen_at))}</span>
    </div>
  `).join('');
}

// ===== /api/escalations + /api/unanswered → alerts page lists =====
async function loadAlerts() {
  try {
    const [escRes, unaRes] = await Promise.all([
      fetch('/api/escalations?status=open', { credentials: 'include' }),
      fetch('/api/unanswered', { credentials: 'include' }),
    ]);
    if (handleUnauthorized(escRes) || handleUnauthorized(unaRes)) return;
    const escData = escRes.ok ? await escRes.json() : { escalations: [] };
    const unaData = unaRes.ok ? await unaRes.json() : { unanswered: [] };

    const items = []
      .concat((escData.escalations || []).map(e => ({ type: 'Handoff', text: e.reason, time: e.created_at })))
      .concat((unaData.unanswered || []).map(u => ({ type: 'Unanswered', text: u.question_text, time: u.created_at })))
      .sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0))
      .slice(0, 10);

    renderAlertsList('dash-alerts-list', items);
  } catch (err) {
    console.warn('[dashboard] loadAlerts failed:', err.message);
  }
}

function renderAlertsList(elId, items) {
  const el = $(elId);
  if (!el) return;
  if (!items.length) {
    el.innerHTML = '<div class="empty-state" style="padding:14px 4px;color:rgba(31,76,143,.45);font-size:13px;">No alerts.</div>';
    return;
  }
  el.innerHTML = items.map(it => `
    <div style="display:flex;align-items:start;gap:10px;padding:10px 0;border-bottom:1px solid rgba(31,76,143,.08);">
      <span style="display:inline-block;background:rgba(15,112,240,.1);color:var(--accent,#0F70F0);font-size:10px;font-weight:600;padding:3px 8px;border-radius:12px;letter-spacing:.05em;text-transform:uppercase;flex-shrink:0;">${escapeHtml(it.type)}</span>
      <span style="font-size:13px;color:#0A1430;line-height:1.4;">${escapeHtml(it.text || '')}</span>
    </div>
  `).join('');
}

// ===== profile / greeting =====
async function loadProfile() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    if (handleUnauthorized(r)) return;
    if (!r.ok) return;
    const data = await r.json();
    const u = data.user || data;
    const name = u.username || u.name || 'there';
    setText('greeting', `Hello, ${name}. 👋`);
    setText('sidebar-username', name);
    setText('profile-fullname', u.name || u.username || '');
    setText('profile-name',     u.name || u.username || '');
    setText('profile-email',    u.email || '');
    setText('today-date',       new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }));
  } catch (err) {
    console.warn('[dashboard] loadProfile failed:', err.message);
  }
}

// ===== bootstrap =====
(function init() {
  wireLogout();
  // Show only the active page on first paint
  document.querySelectorAll('[id^="page-"]').forEach(p => {
    if (p.id !== 'page-dashboard') p.style.display = 'none';
  });
  loadProfile();
  loadMetrics();
  loadBookings();
  loadCustomers();
  loadAlerts();
})();
