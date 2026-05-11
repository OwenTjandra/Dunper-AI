const aggregateGridEl = document.getElementById('aggregate-grid');
const businessesListEl = document.getElementById('businesses-list');
const pipelineTilesEl = document.getElementById('pipeline-tiles');
const upcomingListEl = document.getElementById('upcoming-list');
const clientsTableWrap = document.getElementById('clients-table-wrap');
const refreshOverviewBtn = document.getElementById('refresh-overview');
const refreshClientsBtn = document.getElementById('refresh-clients');
const openAddClientBtn = document.getElementById('open-add-client');
const logoutBtn = document.getElementById('logout-btn');

const modal = document.getElementById('client-modal');
const modalCloseBtn = document.getElementById('client-modal-close');
const modalTitle = document.getElementById('client-modal-title');
const form = document.getElementById('client-form');
const formStatus = document.getElementById('client-form-status');
const saveBtn = document.getElementById('client-save-btn');
const deleteBtn = document.getElementById('client-delete-btn');

const STATUS_LABELS = {
  lead: 'Lead',
  demo_scheduled: 'Demo scheduled',
  demo_done: 'Demo done',
  proposal_sent: 'Proposal sent',
  active: 'Active',
  churned: 'Churned',
  lost: 'Lost',
};

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtMoney(n) {
  if (n == null || isNaN(n)) return '$0.00';
  if (n < 0.01 && n > 0) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${Number(n).toFixed(2)}`;
}

function fmtDate(s) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString();
}

function metricCard(label, value, sub) {
  const subHtml = sub ? `<span class="metric-sub">${escapeHtml(sub)}</span>` : '';
  return `<div class="metric"><span class="metric-label">${escapeHtml(label)}</span><span class="metric-value">${escapeHtml(String(value ?? 0))}</span>${subHtml}</div>`;
}

function handleUnauthorized(res) {
  if (res.status === 401) { window.location.href = '/dunper_signin.html'; return true; }
  return false;
}

logoutBtn?.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/dunper_signin.html';
});

async function loadOverview() {
  if (!aggregateGridEl) return;
  aggregateGridEl.innerHTML = '<p class="hint">Loading…</p>';
  businessesListEl.innerHTML = '<p class="hint">Loading…</p>';
  try {
    const res = await fetch('/api/operator/overview');
    if (handleUnauthorized(res)) return;
    const data = await res.json();

    const a = data.aggregate || {};
    aggregateGridEl.innerHTML = [
      metricCard('Businesses on Dunper', data.businesses?.length ?? 0, 'live deployments'),
      metricCard('Total conversations', a.totalConversations),
      metricCard('Total bookings', a.totalBookings),
      metricCard('Anthropic spend (30d)', fmtMoney(a.anthropicSpendMonth)),
      metricCard('Anthropic spend (all time)', fmtMoney(a.anthropicSpendAllTime)),
      metricCard('Cache hit rate', `${a.cacheHitRate ?? 0}%`, 'higher = cheaper'),
    ].join('');

    if (!data.businesses?.length) {
      businessesListEl.innerHTML = '<p class="hint">No businesses yet.</p>';
    } else {
      businessesListEl.innerHTML = '';
      data.businesses.forEach(b => {
        const row = document.createElement('div');
        row.className = 'business-row';
        row.innerHTML = `
          <div class="business-meta">
            <strong>${escapeHtml(b.name)}</strong>
            <span class="business-sub">${escapeHtml(b.type || '')}</span>
            <span class="business-sub">${escapeHtml(b.hours || '')}</span>
          </div>
          <div class="business-stats">
            <div><span class="bs-label">Conv</span><span class="bs-val">${b.conversations}</span></div>
            <div><span class="bs-label">Msgs</span><span class="bs-val">${b.messages}</span></div>
            <div><span class="bs-label">Bookings</span><span class="bs-val">${b.bookings}</span></div>
            <div><span class="bs-label">Conv. rate</span><span class="bs-val">${b.conversionRate}%</span></div>
            <div><span class="bs-label">Spend (30d)</span><span class="bs-val">${escapeHtml(fmtMoney(b.anthropicSpendMonth))}</span></div>
            <div><span class="bs-label">Open Qs</span><span class="bs-val">${b.openUnanswered}</span></div>
            <div><span class="bs-label">Pending</span><span class="bs-val">${b.openEscalations}</span></div>
          </div>
        `;
        businessesListEl.appendChild(row);
      });
    }

    renderThisWeek(data.pipeline || {});
    renderPipelineTiles(data.pipeline || {});
    renderUpcoming(data.pipeline?.upcoming || []);
  } catch (err) {
    aggregateGridEl.innerHTML = `<p class="hint err">Failed: ${escapeHtml(err.message)}</p>`;
  }
}

function renderThisWeek(pipeline) {
  const grid = document.getElementById('this-week-grid');
  const actions = document.getElementById('this-week-actions');
  const dateEl = document.getElementById('this-week-date');
  if (!grid) return;

  const t = pipeline.totals || {};
  const upcoming = pipeline.upcoming || [];
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const next7 = upcoming.filter(r => {
    const d = new Date(r.next_step_at);
    return d >= now && d <= in7;
  });
  const demosNext7 = next7.filter(r => r.status === 'demo_scheduled').length;

  if (dateEl) {
    const fmt = { month: 'short', day: 'numeric' };
    dateEl.textContent = `${now.toLocaleDateString([], fmt)} → ${in7.toLocaleDateString([], fmt)}`;
  }

  grid.innerHTML = [
    `<div class="tw-tile tw-mrr"><span class="tw-label">Active MRR</span><span class="tw-value">${escapeHtml(fmtMoney(t.activeMrr ?? 0))}</span><span class="tw-sub">${t.active ?? 0} paying ${(t.active === 1) ? 'customer' : 'customers'}</span></div>`,
    `<div class="tw-tile tw-demos"><span class="tw-label">Demos this week</span><span class="tw-value">${demosNext7}</span><span class="tw-sub">scheduled in next 7 days</span></div>`,
    `<div class="tw-tile tw-pipeline"><span class="tw-label">Open pipeline</span><span class="tw-value">${(t.leads ?? 0) + (t.demoScheduled ?? 0) + (t.demoDone ?? 0) + (t.proposalSent ?? 0)}</span><span class="tw-sub">leads + demos + proposals</span></div>`,
    `<div class="tw-tile tw-actions-count"><span class="tw-label">Actions due</span><span class="tw-value">${next7.length}</span><span class="tw-sub">next steps in next 7 days</span></div>`,
  ].join('');

  if (!next7.length) {
    actions.innerHTML = `<p class="hint" style="margin-top:14px;">No next steps scheduled in the next 7 days. <a href="#" id="this-week-add">Add one</a>.</p>`;
    const addLink = document.getElementById('this-week-add');
    if (addLink) addLink.addEventListener('click', (e) => { e.preventDefault(); openAddClientBtn?.click(); });
    return;
  }
  let html = '<div class="tw-actions-list">';
  next7.slice(0, 5).forEach(r => {
    html += `<div class="tw-action-row" data-id="${r.id}">
      <span class="tw-action-when">${escapeHtml(fmtDate(r.next_step_at))}</span>
      <span class="tw-action-name">${escapeHtml(r.business_name)}</span>
      <span class="tw-action-step">${escapeHtml(r.next_step || '—')}</span>
      <span class="pill status-${escapeHtml(r.status)}">${escapeHtml(STATUS_LABELS[r.status] || r.status)}</span>
    </div>`;
  });
  html += '</div>';
  actions.innerHTML = html;
  actions.querySelectorAll('.tw-action-row').forEach(el => {
    el.addEventListener('click', () => openEditClient(Number(el.dataset.id)));
  });
}

function renderPipelineTiles(pipeline) {
  const t = pipeline.totals || {};
  pipelineTilesEl.innerHTML = `
    <div class="pipeline-tile lead">
      <span class="ptl">Leads</span><span class="ptv">${t.leads ?? 0}</span>
    </div>
    <div class="pipeline-tile demo">
      <span class="ptl">Demos</span><span class="ptv">${(t.demoScheduled ?? 0) + (t.demoDone ?? 0)}</span>
      <span class="pts">${t.demoScheduled ?? 0} scheduled · ${t.demoDone ?? 0} done</span>
    </div>
    <div class="pipeline-tile proposal">
      <span class="ptl">Proposals out</span><span class="ptv">${t.proposalSent ?? 0}</span>
    </div>
    <div class="pipeline-tile active">
      <span class="ptl">Active</span><span class="ptv">${t.active ?? 0}</span>
      <span class="pts">${fmtMoney(t.activeMrr ?? 0)} MRR</span>
    </div>
    <div class="pipeline-tile lost">
      <span class="ptl">Churned · Lost</span><span class="ptv">${(t.churned ?? 0) + (t.lost ?? 0)}</span>
    </div>
  `;
}

function renderUpcoming(rows) {
  if (!rows?.length) {
    upcomingListEl.innerHTML = '';
    return;
  }
  let html = '<h4 class="upcoming-head">Upcoming next steps (next 14 days)</h4><div class="upcoming-rows">';
  rows.forEach(r => {
    html += `<div class="upcoming-row" data-id="${r.id}">
      <span class="upcoming-when">${escapeHtml(fmtDate(r.next_step_at))}</span>
      <span class="upcoming-name">${escapeHtml(r.business_name)}</span>
      <span class="upcoming-step">${escapeHtml(r.next_step || '')}</span>
      <span class="upcoming-status status-${escapeHtml(r.status)}">${escapeHtml(STATUS_LABELS[r.status] || r.status)}</span>
    </div>`;
  });
  html += '</div>';
  upcomingListEl.innerHTML = html;

  upcomingListEl.querySelectorAll('.upcoming-row').forEach(el => {
    el.addEventListener('click', () => openEditClient(Number(el.dataset.id)));
  });
}

async function loadClients() {
  clientsTableWrap.innerHTML = '<p class="hint">Loading…</p>';
  try {
    const res = await fetch('/api/operator/clients');
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    if (!data.clients?.length) {
      clientsTableWrap.innerHTML = '<p class="hint">No prospects yet. Click "+ New prospect" to add your first one.</p>';
      return;
    }
    let html = '<table class="clients-table"><thead><tr><th>Business</th><th>Status</th><th>Plan</th><th>MRR</th><th>Next step</th><th>When</th><th>Vertical</th><th></th></tr></thead><tbody>';
    data.clients.forEach(c => {
      html += `<tr data-id="${c.id}" class="clickable">
        <td><strong>${escapeHtml(c.business_name)}</strong>${c.contact_name ? `<div class="ct-sub">${escapeHtml(c.contact_name)}</div>` : ''}</td>
        <td><span class="pill status-${escapeHtml(c.status)}">${escapeHtml(STATUS_LABELS[c.status] || c.status)}</span></td>
        <td>${escapeHtml(c.plan || '—')}</td>
        <td>${c.mrr_usd ? escapeHtml(fmtMoney(c.mrr_usd)) : '—'}</td>
        <td>${escapeHtml(c.next_step || '—')}</td>
        <td>${escapeHtml(fmtDate(c.next_step_at))}</td>
        <td>${escapeHtml(c.vertical || '—')}</td>
        <td>›</td>
      </tr>`;
    });
    html += '</tbody></table>';
    clientsTableWrap.innerHTML = html;

    clientsTableWrap.querySelectorAll('tr.clickable').forEach(el => {
      el.addEventListener('click', () => openEditClient(Number(el.dataset.id)));
    });
  } catch (err) {
    clientsTableWrap.innerHTML = `<p class="hint err">Failed: ${escapeHtml(err.message)}</p>`;
  }
}

function openModal() { modal.hidden = false; document.body.style.overflow = 'hidden'; }
function closeModal() { modal.hidden = true; document.body.style.overflow = ''; }
modalCloseBtn?.addEventListener('click', closeModal);
modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

function resetForm() {
  document.getElementById('client-id').value = '';
  document.getElementById('client-business-name').value = '';
  document.getElementById('client-contact-name').value = '';
  document.getElementById('client-contact-email').value = '';
  document.getElementById('client-contact-phone').value = '';
  document.getElementById('client-vertical').value = '';
  document.getElementById('client-status').value = 'lead';
  document.getElementById('client-plan').value = '';
  document.getElementById('client-mrr').value = '';
  document.getElementById('client-next-step').value = '';
  document.getElementById('client-next-step-at').value = '';
  document.getElementById('client-notes').value = '';
  formStatus.textContent = '';
  formStatus.className = 'status';
  deleteBtn.hidden = true;
}

openAddClientBtn?.addEventListener('click', () => {
  resetForm();
  modalTitle.textContent = 'Add prospect';
  openModal();
});

async function openEditClient(id) {
  resetForm();
  modalTitle.textContent = 'Edit prospect';
  deleteBtn.hidden = false;
  try {
    const res = await fetch('/api/operator/clients');
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    const c = data.clients.find(x => x.id === id);
    if (!c) return;
    document.getElementById('client-id').value = c.id;
    document.getElementById('client-business-name').value = c.business_name || '';
    document.getElementById('client-contact-name').value = c.contact_name || '';
    document.getElementById('client-contact-email').value = c.contact_email || '';
    document.getElementById('client-contact-phone').value = c.contact_phone || '';
    document.getElementById('client-vertical').value = c.vertical || '';
    document.getElementById('client-status').value = c.status || 'lead';
    document.getElementById('client-plan').value = c.plan || '';
    document.getElementById('client-mrr').value = c.mrr_usd ?? '';
    document.getElementById('client-next-step').value = c.next_step || '';
    document.getElementById('client-next-step-at').value = c.next_step_at ? c.next_step_at.slice(0, 10) : '';
    document.getElementById('client-notes').value = c.notes || '';
    openModal();
  } catch (err) {
    alert(err.message);
  }
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('client-id').value;
  const payload = {
    businessName: document.getElementById('client-business-name').value.trim(),
    contactName: document.getElementById('client-contact-name').value.trim() || null,
    contactEmail: document.getElementById('client-contact-email').value.trim() || null,
    contactPhone: document.getElementById('client-contact-phone').value.trim() || null,
    vertical: document.getElementById('client-vertical').value.trim() || null,
    status: document.getElementById('client-status').value,
    plan: document.getElementById('client-plan').value || null,
    mrrUsd: document.getElementById('client-mrr').value || null,
    nextStep: document.getElementById('client-next-step').value.trim() || null,
    nextStepAt: document.getElementById('client-next-step-at').value || null,
    notes: document.getElementById('client-notes').value.trim() || null,
  };
  saveBtn.disabled = true;
  formStatus.textContent = 'Saving…';
  try {
    const url = id ? `/api/operator/clients/${id}` : '/api/operator/clients';
    const method = id ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    formStatus.textContent = 'Saved ✓';
    formStatus.className = 'status ok';
    await Promise.all([loadOverview(), loadClients()]);
    setTimeout(closeModal, 500);
  } catch (err) {
    formStatus.textContent = err.message;
    formStatus.className = 'status err';
  } finally {
    saveBtn.disabled = false;
  }
});

deleteBtn?.addEventListener('click', async () => {
  const id = document.getElementById('client-id').value;
  if (!id) return;
  if (!confirm('Delete this prospect? Cannot be undone.')) return;
  deleteBtn.disabled = true;
  try {
    const res = await fetch(`/api/operator/clients/${id}`, { method: 'DELETE' });
    if (handleUnauthorized(res)) return;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    closeModal();
    await Promise.all([loadOverview(), loadClients()]);
  } catch (err) {
    alert(err.message);
    deleteBtn.disabled = false;
  }
});

refreshOverviewBtn?.addEventListener('click', loadOverview);
refreshClientsBtn?.addEventListener('click', loadClients);

loadOverview();
loadClients();
