const form = document.getElementById('business-form');
const servicesList = document.getElementById('services-list');
const rulesList = document.getElementById('rules-list');
const statusEl = document.getElementById('status');
const saveBtn = document.getElementById('save-btn');

document.getElementById('add-service').addEventListener('click', () => addServiceRow());
document.getElementById('add-rule').addEventListener('click', () => addRuleRow());

function addServiceRow(service = { name: '', duration_minutes: 30, price: '' }) {
  const row = document.createElement('div');
  row.className = 'service-row';
  row.innerHTML = `
    <input type="text" data-field="name" placeholder="Service name" />
    <input type="number" data-field="duration_minutes" placeholder="Minutes" min="1" />
    <input type="text" data-field="price" placeholder="Price" />
    <button type="button" class="icon-btn" aria-label="Remove">×</button>
  `;
  row.querySelector('[data-field="name"]').value = service.name;
  row.querySelector('[data-field="duration_minutes"]').value = service.duration_minutes;
  row.querySelector('[data-field="price"]').value = service.price;
  row.querySelector('.icon-btn').addEventListener('click', () => row.remove());
  servicesList.appendChild(row);
}

function addRuleRow(rule = '') {
  const row = document.createElement('div');
  row.className = 'rule-row';
  row.innerHTML = `
    <input type="text" placeholder="e.g. Minimum 24 hours advance notice." />
    <button type="button" class="icon-btn" aria-label="Remove">×</button>
  `;
  row.querySelector('input').value = rule;
  row.querySelector('.icon-btn').addEventListener('click', () => row.remove());
  rulesList.appendChild(row);
}

let currentBusinessExtras = {};

function fillForm(b) {
  form.name.value = b.name || '';
  form.type.value = b.type || '';
  form.hours.value = b.hours || '';
  form.address.value = b.address || '';
  form.phone.value = b.phone || '';
  form.tone.value = b.tone || '';
  form.fallback_contact.value = b.fallback_contact || '';
  if (form.whatsapp_number) form.whatsapp_number.value = b.whatsapp_number || '';
  if (form.whatsapp_prefill_message) form.whatsapp_prefill_message.value = b.whatsapp_prefill_message || '';
  if (form.logo_url) form.logo_url.value = b.logo_url || '';

  currentBusinessExtras = {
    hours_structured: b.hours_structured ?? null,
  };

  servicesList.innerHTML = '';
  (b.services || []).forEach(addServiceRow);
  if (!b.services?.length) addServiceRow();

  rulesList.innerHTML = '';
  (b.booking_rules || []).forEach(addRuleRow);
  if (!b.booking_rules?.length) addRuleRow();
}

function collectForm() {
  const services = [...servicesList.querySelectorAll('.service-row')].map(row => ({
    name: row.querySelector('[data-field="name"]').value.trim(),
    duration_minutes: Number(row.querySelector('[data-field="duration_minutes"]').value),
    price: row.querySelector('[data-field="price"]').value.trim(),
  })).filter(s => s.name);

  const booking_rules = [...rulesList.querySelectorAll('.rule-row input')]
    .map(i => i.value.trim())
    .filter(Boolean);

  const out = {
    name: form.name.value.trim(),
    type: form.type.value.trim(),
    hours: form.hours.value.trim(),
    address: form.address.value.trim(),
    phone: form.phone.value.trim(),
    tone: form.tone.value.trim(),
    fallback_contact: form.fallback_contact.value.trim(),
    whatsapp_number: form.whatsapp_number?.value.trim() || '',
    whatsapp_prefill_message: form.whatsapp_prefill_message?.value.trim() || '',
    logo_url: form.logo_url?.value.trim() || '',
    services,
    booking_rules,
  };
  if (currentBusinessExtras.hours_structured) {
    out.hours_structured = currentBusinessExtras.hours_structured;
  }
  return out;
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = `status ${kind || ''}`;
  if (kind === 'ok') setTimeout(() => { statusEl.textContent = ''; }, 2500);
}

function handleUnauthorized(res) {
  if (res.status === 401) {
    window.location.href = '/login.html';
    return true;
  }
  return false;
}

async function loadBusiness() {
  try {
    const res = await fetch('/api/business');
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    fillForm(data);
  } catch (err) {
    setStatus(`Failed to load: ${err.message}`, 'err');
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
}
document.getElementById('logout-btn')?.addEventListener('click', logout);

const historyListEl = document.getElementById('history-list');
const refreshHistoryBtn = document.getElementById('refresh-history');

function formatTimestamp(iso) {
  const d = new Date(iso.endsWith('Z') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function renderHistory(versions) {
  historyListEl.innerHTML = '';
  if (!versions.length) {
    historyListEl.innerHTML = '<p class="hint">No history yet.</p>';
    return;
  }
  versions.forEach((v, idx) => {
    const isCurrent = idx === 0;
    const row = document.createElement('div');
    row.className = `history-row ${isCurrent ? 'current' : ''}`;

    const meta = document.createElement('div');
    meta.className = 'history-meta';

    const top = document.createElement('div');
    top.className = 'top';
    const vid = document.createElement('span');
    vid.className = 'vid';
    vid.textContent = `#${v.id}`;
    top.appendChild(vid);
    const who = document.createElement('span');
    who.textContent = v.username ? `by ${v.username}` : 'system';
    top.appendChild(who);
    if (isCurrent) {
      const badge = document.createElement('span');
      badge.className = 'current-badge';
      badge.textContent = 'Current';
      top.appendChild(badge);
    }
    meta.appendChild(top);

    const sub = document.createElement('div');
    sub.className = 'sub';
    const summary = `${v.summary.name} · ${v.summary.services} services · ${v.summary.rules} rules`;
    sub.textContent = `${formatTimestamp(v.createdAt)} · ${summary}${v.note ? ` · ${v.note}` : ''}`;
    meta.appendChild(sub);

    row.appendChild(meta);

    if (!isCurrent) {
      const restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'ghost-btn';
      restoreBtn.textContent = 'Restore';
      restoreBtn.addEventListener('click', () => restoreVersion(v.id));
      row.appendChild(restoreBtn);
    }

    historyListEl.appendChild(row);
  });
}

async function loadHistory() {
  try {
    const res = await fetch('/api/business/versions');
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    renderHistory(data.versions || []);
  } catch (err) {
    historyListEl.innerHTML = `<p class="hint">Failed to load history: ${err.message}</p>`;
  }
}

async function restoreVersion(id) {
  if (!confirm(`Restore to version #${id}? Your current values will be replaced (but kept in history).`)) return;
  try {
    const res = await fetch(`/api/business/versions/${id}/restore`, { method: 'POST' });
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Restore failed');
    fillForm(data.business);
    setStatus(`Restored from #${id} ✓`, 'ok');
    loadHistory();
  } catch (err) {
    setStatus(err.message, 'err');
  }
}

refreshHistoryBtn?.addEventListener('click', loadHistory);

const assistantMessagesEl = document.getElementById('assistant-messages');
const assistantFormEl = document.getElementById('assistant-form');
const assistantInputEl = document.getElementById('assistant-input');
const assistantSendBtn = document.getElementById('assistant-send');
const assistantResetBtn = document.getElementById('assistant-reset');

let assistantHistory = [];

function appendAssistantMessage(role, text, toolCalls) {
  const el = document.createElement('div');
  el.className = `assistant-msg ${role}`;
  el.textContent = text;
  if (toolCalls?.length) {
    const tools = document.createElement('div');
    tools.className = 'assistant-tools';
    toolCalls.forEach(tc => {
      const chip = document.createElement('span');
      chip.className = `assistant-tool-chip ${tc.ok ? '' : 'failed'}`;
      chip.textContent = tc.ok ? tc.name : `${tc.name} (failed)`;
      tools.appendChild(chip);
    });
    el.appendChild(tools);
  }
  assistantMessagesEl.appendChild(el);
  assistantMessagesEl.scrollTop = assistantMessagesEl.scrollHeight;
  return el;
}

function showThinking() {
  const el = document.createElement('div');
  el.className = 'assistant-msg thinking';
  el.id = 'assistant-thinking';
  el.textContent = 'Thinking…';
  assistantMessagesEl.appendChild(el);
  assistantMessagesEl.scrollTop = assistantMessagesEl.scrollHeight;
}

function hideThinking() {
  document.getElementById('assistant-thinking')?.remove();
}

assistantFormEl?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = assistantInputEl.value.trim();
  if (!text) return;

  assistantHistory.push({ role: 'user', content: text });
  appendAssistantMessage('user', text);
  assistantInputEl.value = '';
  assistantSendBtn.disabled = true;
  showThinking();

  try {
    const res = await fetch('/api/admin/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: assistantHistory }),
    });
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    hideThinking();
    if (!res.ok) {
      appendAssistantMessage('error', data.error || 'Assistant failed');
      assistantHistory.pop();
      return;
    }
    assistantHistory.push({ role: 'assistant', content: data.reply });
    appendAssistantMessage('assistant', data.reply, data.toolCalls);
    if (data.business) {
      fillForm(data.business);
      loadHistory();
    }
  } catch (err) {
    hideThinking();
    appendAssistantMessage('error', `Network error: ${err.message}`);
    assistantHistory.pop();
  } finally {
    assistantSendBtn.disabled = false;
    assistantInputEl.focus();
  }
});

assistantResetBtn?.addEventListener('click', () => {
  assistantHistory = [];
  assistantMessagesEl.innerHTML = '';
});

const customersListEl = document.getElementById('customers-list');
const refreshCustomersBtn = document.getElementById('refresh-customers');
const openCustomerIds = new Set();

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso.endsWith('Z') ? iso : iso.replace(' ', 'T') + 'Z');
  const ms = Date.now() - d.getTime();
  if (Number.isNaN(ms)) return iso;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString();
}

function renderCustomerSummary(p) {
  const summary = document.createElement('div');
  summary.className = 'customer-summary';

  const meta = document.createElement('div');
  meta.className = 'customer-meta';

  const top = document.createElement('div');
  top.className = 'top';
  const pid = document.createElement('span');
  pid.className = 'pid';
  pid.textContent = `#${p.id}`;
  top.appendChild(pid);
  const isWhatsApp = String(p.session_id || '').startsWith('wa:');
  if (isWhatsApp) {
    const channel = document.createElement('span');
    channel.className = 'channel-tag wa';
    channel.textContent = 'WhatsApp';
    top.appendChild(channel);
  } else {
    const channel = document.createElement('span');
    channel.className = 'channel-tag web';
    channel.textContent = 'Web';
    top.appendChild(channel);
  }
  const nameEl = document.createElement('span');
  nameEl.textContent = p.name || '(unnamed)';
  top.appendChild(nameEl);
  if (p.phone) {
    const phoneEl = document.createElement('span');
    phoneEl.style.color = '#6b7280';
    phoneEl.style.fontSize = '13px';
    phoneEl.textContent = `· ${p.phone}`;
    top.appendChild(phoneEl);
  }
  meta.appendChild(top);

  const sub = document.createElement('div');
  sub.className = 'sub';
  sub.textContent = `Last seen ${timeAgo(p.last_seen_at)}`;
  meta.appendChild(sub);

  if (p.last_message) {
    const last = document.createElement('div');
    last.className = 'last';
    last.textContent = p.last_message;
    meta.appendChild(last);
  }

  summary.appendChild(meta);

  const count = document.createElement('span');
  count.className = 'customer-count';
  count.textContent = `${p.message_count} msg${p.message_count === 1 ? '' : 's'}`;
  summary.appendChild(count);

  return summary;
}

function renderConversation(messages) {
  const wrap = document.createElement('div');
  wrap.className = 'customer-conversation';
  messages.forEach(m => {
    const el = document.createElement('div');
    el.className = `conv-msg ${m.role}`;
    if (m.attachments?.length) {
      m.attachments.forEach(a => {
        const img = document.createElement('img');
        img.className = 'conv-attached';
        img.src = a.url;
        img.alt = a.filename;
        el.appendChild(img);
      });
    }
    if (m.content) {
      const span = document.createElement('span');
      span.textContent = m.content;
      el.appendChild(span);
    }
    const ts = document.createElement('span');
    ts.className = 'ts';
    ts.textContent = timeAgo(m.createdAt);
    el.appendChild(ts);
    wrap.appendChild(el);
  });
  return wrap;
}

async function expandCustomer(profileId, row) {
  let detail = row.querySelector('.customer-detail');
  if (detail) {
    detail.remove();
    row.classList.remove('open');
    openCustomerIds.delete(profileId);
    return;
  }
  row.classList.add('open');
  openCustomerIds.add(profileId);

  detail = document.createElement('div');
  detail.className = 'customer-detail';
  detail.innerHTML = '<p class="hint">Loading…</p>';
  row.appendChild(detail);

  try {
    const res = await fetch(`/api/profiles/${profileId}`);
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load');

    detail.innerHTML = '';

    const editRow = document.createElement('div');
    editRow.className = 'customer-edit-row';
    editRow.innerHTML = `
      <label><span>Name</span><input type="text" data-field="name" /></label>
      <label><span>Phone</span><input type="text" data-field="phone" /></label>
      <button type="button" class="primary-btn" data-save>Save</button>
    `;
    editRow.querySelector('[data-field="name"]').value = data.profile.name || '';
    editRow.querySelector('[data-field="phone"]').value = data.profile.phone || '';
    detail.appendChild(editRow);

    const summaryBox = document.createElement('div');
    summaryBox.className = 'ai-summary';
    summaryBox.innerHTML = `
      <div class="ai-summary-head">
        <span class="ai-summary-title">AI summary</span>
        <button type="button" class="ghost-btn" data-summarize>Generate</button>
      </div>
      <div class="ai-summary-body"><p class="hint">Click Generate to have the AI summarize this conversation.</p></div>
    `;
    detail.appendChild(summaryBox);
    fetch(`/api/profiles/${profileId}/summary`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.summary) renderSummaryInto(summaryBox.querySelector('.ai-summary-body'), d.summary); });
    summaryBox.querySelector('[data-summarize]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Thinking…';
      const body = summaryBox.querySelector('.ai-summary-body');
      body.innerHTML = '<p class="hint">Generating…</p>';
      try {
        const r = await fetch(`/api/profiles/${profileId}/summarize`, { method: 'POST' });
        if (handleUnauthorized(r)) return;
        const dd = await r.json();
        if (!r.ok) throw new Error(dd.error || 'Failed');
        renderSummaryInto(body, dd.summary);
      } catch (err) {
        body.innerHTML = `<p class="hint err">${err.message}</p>`;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Regenerate';
      }
    });

    const notesLabel = document.createElement('label');
    notesLabel.innerHTML = '<span>Internal notes</span><textarea rows="2" placeholder="Anything you want to remember about this customer…"></textarea>';
    notesLabel.querySelector('textarea').value = data.profile.notes || '';
    detail.appendChild(notesLabel);

    editRow.querySelector('[data-save]').addEventListener('click', async () => {
      const payload = {
        name: editRow.querySelector('[data-field="name"]').value.trim(),
        phone: editRow.querySelector('[data-field="phone"]').value.trim(),
        notes: notesLabel.querySelector('textarea').value.trim(),
      };
      const r = await fetch(`/api/profiles/${profileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (handleUnauthorized(r)) return;
      if (r.ok) loadCustomers();
    });

    detail.appendChild(renderConversation(data.messages));
  } catch (err) {
    detail.innerHTML = `<p class="hint">Failed: ${err.message}</p>`;
  }
}

async function loadCustomers() {
  try {
    const res = await fetch('/api/profiles');
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    customersListEl.innerHTML = '';
    if (!data.profiles?.length) {
      customersListEl.innerHTML = '<p class="hint">No conversations yet.</p>';
      return;
    }
    data.profiles.forEach(p => {
      const row = document.createElement('div');
      row.className = 'customer-row';
      row.dataset.profileId = String(p.id);
      const summary = renderCustomerSummary(p);
      summary.addEventListener('click', () => expandCustomer(p.id, row));
      row.appendChild(summary);
      customersListEl.appendChild(row);
      if (openCustomerIds.has(p.id)) {
        openCustomerIds.delete(p.id);
        expandCustomer(p.id, row);
      }
    });
  } catch (err) {
    customersListEl.innerHTML = `<p class="hint">Failed to load: ${err.message}</p>`;
  }
}

refreshCustomersBtn?.addEventListener('click', loadCustomers);
loadCustomers();

const documentsListEl = document.getElementById('documents-list');
const documentsFormEl = document.getElementById('documents-form');
const documentsFileEl = document.getElementById('documents-file');
const documentsUploadBtn = document.getElementById('documents-upload-btn');
const documentsStatusEl = document.getElementById('documents-status');
const refreshDocumentsBtn = document.getElementById('refresh-documents');

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function setDocStatus(text, kind) {
  documentsStatusEl.textContent = text;
  documentsStatusEl.className = `status ${kind || ''}`;
  if (kind === 'ok') setTimeout(() => { documentsStatusEl.textContent = ''; }, 2500);
}

async function loadDocuments() {
  try {
    const res = await fetch('/api/business/documents');
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    documentsListEl.innerHTML = '';
    if (!data.documents?.length) {
      documentsListEl.innerHTML = '<p class="hint">No documents yet.</p>';
      return;
    }
    data.documents.forEach(d => {
      const row = document.createElement('div');
      row.className = 'document-row';

      const meta = document.createElement('div');
      meta.className = 'document-meta';
      const top = document.createElement('div');
      top.className = 'top';
      top.textContent = d.filename;
      meta.appendChild(top);
      const sub = document.createElement('div');
      sub.className = 'sub';
      const who = d.uploadedBy ? `by ${d.uploadedBy}` : '';
      sub.textContent = `${d.contentType} · ${formatBytes(d.size)} · ${timeAgo(d.createdAt)}${who ? ' · ' + who : ''}`;
      meta.appendChild(sub);
      row.appendChild(meta);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn';
      del.title = 'Delete';
      del.textContent = '×';
      del.addEventListener('click', () => deleteDocument(d.id, d.filename));
      row.appendChild(del);

      documentsListEl.appendChild(row);
    });
  } catch (err) {
    documentsListEl.innerHTML = `<p class="hint">Failed to load: ${err.message}</p>`;
  }
}

async function deleteDocument(id, filename) {
  if (!confirm(`Delete "${filename}"? The customer AI will stop seeing it immediately.`)) return;
  const res = await fetch(`/api/business/documents/${id}`, { method: 'DELETE' });
  if (handleUnauthorized(res)) return;
  if (res.ok) loadDocuments();
}

documentsFormEl?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = documentsFileEl.files?.[0];
  if (!file) return;
  documentsUploadBtn.disabled = true;
  setDocStatus('Uploading…', '');
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/business/documents', { method: 'POST', body: fd });
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    setDocStatus('Uploaded ✓', 'ok');
    documentsFileEl.value = '';
    loadDocuments();
  } catch (err) {
    setDocStatus(err.message, 'err');
  } finally {
    documentsUploadBtn.disabled = false;
  }
});

refreshDocumentsBtn?.addEventListener('click', loadDocuments);
loadDocuments();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  saveBtn.disabled = true;
  setStatus('Saving...', '');
  try {
    const res = await fetch('/api/business', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectForm()),
    });
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed');
    setStatus('Saved ✓', 'ok');
    loadHistory();
  } catch (err) {
    setStatus(err.message, 'err');
  } finally {
    saveBtn.disabled = false;
  }
});

loadBusiness();
loadHistory();

function renderSummaryInto(el, summary) {
  el.innerHTML = '';
  const text = document.createElement('p');
  text.className = 'ai-summary-text';
  text.textContent = summary.summary || '(empty)';
  el.appendChild(text);
  if (summary.intent || summary.sentiment) {
    const tags = document.createElement('div');
    tags.className = 'ai-summary-tags';
    if (summary.intent) {
      const t = document.createElement('span');
      t.className = 'tag';
      t.textContent = summary.intent;
      tags.appendChild(t);
    }
    if (summary.sentiment) {
      const t = document.createElement('span');
      t.className = `tag sentiment ${summary.sentiment}`;
      t.textContent = summary.sentiment;
      tags.appendChild(t);
    }
    el.appendChild(tags);
  }
  if (summary.updated_at) {
    const ts = document.createElement('span');
    ts.className = 'ai-summary-ts';
    ts.textContent = `Updated ${new Date(summary.updated_at).toLocaleString()}`;
    el.appendChild(ts);
  }
}

const bookingsListEl = document.getElementById('bookings-list');
const refreshBookingsBtn = document.getElementById('refresh-bookings');

async function loadBookings() {
  if (!bookingsListEl) return;
  bookingsListEl.innerHTML = '<p class="hint">Loading…</p>';
  try {
    const res = await fetch('/api/bookings');
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    if (!data.bookings?.length) {
      bookingsListEl.innerHTML = '<p class="hint">No bookings yet.</p>';
      return;
    }
    bookingsListEl.innerHTML = '';
    data.bookings.forEach(b => bookingsListEl.appendChild(renderBookingRow(b)));
  } catch (err) {
    bookingsListEl.innerHTML = `<p class="hint err">Failed: ${err.message}</p>`;
  }
}

function renderBookingRow(b) {
  const row = document.createElement('div');
  row.className = `booking-row ${b.status === 'cancelled' ? 'cancelled' : ''}`;
  const start = new Date(b.starts_at);
  const dateStr = start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const meta = document.createElement('div');
  meta.className = 'booking-meta';
  meta.innerHTML = `
    <div class="top">
      <strong>${escapeHtml(b.service_name)}</strong>
      <span class="when">${dateStr} · ${timeStr}</span>
    </div>
    <div class="sub">${escapeHtml(b.customer_name)} · ${escapeHtml(b.customer_phone)} · ${b.duration_minutes} min</div>
  `;
  row.appendChild(meta);

  const right = document.createElement('div');
  right.className = 'booking-right';
  if (b.status === 'cancelled') {
    const tag = document.createElement('span');
    tag.className = 'tag sentiment negative';
    tag.textContent = 'cancelled';
    right.appendChild(tag);
  } else {
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'ghost-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', async () => {
      if (!confirm('Cancel this booking?')) return;
      cancelBtn.disabled = true;
      const r = await fetch(`/api/bookings/${b.id}/cancel`, { method: 'POST' });
      if (handleUnauthorized(r)) return;
      if (r.ok) loadBookings();
      else { cancelBtn.disabled = false; alert('Failed to cancel'); }
    });
    right.appendChild(cancelBtn);
  }
  row.appendChild(right);
  return row;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

refreshBookingsBtn?.addEventListener('click', loadBookings);
loadBookings();

const integrationStatusEl = document.getElementById('integration-status');
const refreshIntegrationsBtn = document.getElementById('refresh-integrations');

async function loadIntegrationStatus() {
  if (!integrationStatusEl) return;
  integrationStatusEl.innerHTML = '<p class="hint">Loading…</p>';
  try {
    const res = await fetch('/api/integrations/google');
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    integrationStatusEl.innerHTML = '';

    if (data.configError) {
      const err = document.createElement('p');
      err.className = 'hint err';
      err.textContent = `Server-side config: ${data.configError}. Set the GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI vars in .env and restart.`;
      integrationStatusEl.appendChild(err);
      return;
    }

    if (!data.connected) {
      const wrap = document.createElement('div');
      wrap.className = 'integration-row';
      wrap.innerHTML = `
        <p class="hint">Connect your Google account to sync new bookings into a calendar and a spreadsheet of your choice.</p>
      `;
      const connect = document.createElement('a');
      connect.href = '/api/integrations/google/connect';
      connect.className = 'primary-btn';
      connect.textContent = 'Connect Google';
      wrap.appendChild(connect);
      integrationStatusEl.appendChild(wrap);
      return;
    }

    const head = document.createElement('div');
    head.className = 'integration-row';
    head.innerHTML = `
      <div class="integration-meta">
        <strong>Connected as</strong>
        <code class="copyable">${escapeHtml(data.email || '(unknown)')}</code>
      </div>
    `;
    const disconnectBtn = document.createElement('button');
    disconnectBtn.type = 'button';
    disconnectBtn.className = 'ghost-btn';
    disconnectBtn.textContent = 'Disconnect';
    disconnectBtn.addEventListener('click', disconnectGoogle);
    head.appendChild(disconnectBtn);
    integrationStatusEl.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'integration-grid';
    grid.innerHTML = `
      <div class="integration-pill ${data.calendarId ? 'on' : 'off'}">
        <strong>Calendar</strong>
        <select data-pick="calendar"><option value="">Loading…</option></select>
      </div>
      <div class="integration-pill ${data.sheetId ? 'on' : 'off'}">
        <strong>Sheet</strong>
        <select data-pick="sheet"><option value="">Loading…</option></select>
        <button type="button" class="ghost-btn" data-create-sheet>+ Create new</button>
      </div>
    `;
    integrationStatusEl.appendChild(grid);

    grid.querySelector('[data-pick="calendar"]').addEventListener('change', (e) => {
      saveSelection({ calendarId: e.target.value });
    });
    grid.querySelector('[data-pick="sheet"]').addEventListener('change', (e) => {
      saveSelection({ sheetId: e.target.value });
    });
    const createBtn = grid.querySelector('[data-create-sheet]');
    createBtn.addEventListener('click', () => createNewSheet(createBtn));

    populateCalendars(grid.querySelector('[data-pick="calendar"]'), data.calendarId);
    populateSheets(grid.querySelector('[data-pick="sheet"]'), data.sheetId);
  } catch (err) {
    integrationStatusEl.innerHTML = `<p class="hint err">Failed: ${escapeHtml(err.message)}</p>`;
  }
}

async function populateCalendars(select, currentId) {
  try {
    const res = await fetch('/api/integrations/google/calendars');
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to list calendars');
    select.innerHTML = '<option value="">— Pick a calendar —</option>' + data.calendars.map(c =>
      `<option value="${escapeHtml(c.id)}" ${c.id === currentId ? 'selected' : ''}>${escapeHtml(c.summary)}${c.primary ? ' (primary)' : ''}</option>`
    ).join('');
  } catch (err) {
    select.innerHTML = `<option value="">Failed: ${escapeHtml(err.message)}</option>`;
  }
}

async function populateSheets(select, currentId) {
  try {
    const res = await fetch('/api/integrations/google/sheets');
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to list sheets');
    select.innerHTML = '<option value="">— Pick a sheet —</option>' + data.sheets.map(s =>
      `<option value="${escapeHtml(s.id)}" ${s.id === currentId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
    ).join('');
  } catch (err) {
    select.innerHTML = `<option value="">Failed: ${escapeHtml(err.message)}</option>`;
  }
}

async function saveSelection(payload) {
  if (!payload.calendarId && !payload.sheetId) return;
  try {
    const res = await fetch('/api/integrations/google/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (handleUnauthorized(res)) return;
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Save failed');
    }
  } catch (err) {
    alert(`Failed to save: ${err.message}`);
  }
}

async function createNewSheet(button) {
  const originalLabel = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = 'Creating…';
  }
  try {
    const title = `Frontdesk — ${new Date().toLocaleDateString()}`;
    const res = await fetch('/api/integrations/google/sheets/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Create failed');
    loadIntegrationStatus();
  } catch (err) {
    alert(`Failed to create sheet: ${err.message}`);
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }
}

async function disconnectGoogle() {
  if (!confirm('Disconnect Google? Future bookings won\'t sync until you connect again.')) return;
  const res = await fetch('/api/integrations/google/disconnect', { method: 'POST' });
  if (handleUnauthorized(res)) return;
  loadIntegrationStatus();
}

if (location.search.includes('google=connected')) {
  history.replaceState(null, '', location.pathname);
}

refreshIntegrationsBtn?.addEventListener('click', loadIntegrationStatus);
loadIntegrationStatus();

const whatsappStatusEl = document.getElementById('whatsapp-status');
const refreshWhatsappBtn = document.getElementById('refresh-whatsapp');

async function loadWhatsAppStatus() {
  if (!whatsappStatusEl) return;
  whatsappStatusEl.innerHTML = '<p class="hint">Loading…</p>';
  try {
    const res = await fetch('/api/integrations/whatsapp');
    if (handleUnauthorized(res)) return;
    const data = await res.json();
    whatsappStatusEl.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'integration-grid';
    grid.innerHTML = `
      <div class="integration-pill ${data.configured ? 'on' : 'off'}">
        <strong>WhatsApp Cloud API</strong>
        <span>${data.configured ? 'Configured' : 'Not configured'}</span>
        ${data.phoneNumberId ? `<code>Phone Number ID: ${escapeHtml(data.phoneNumberId)}</code>` : '<code class="muted">WHATSAPP_PHONE_NUMBER_ID not set</code>'}
      </div>
      <div class="integration-pill ${data.verifyTokenSet && data.accessTokenSet ? 'on' : 'off'}">
        <strong>Webhook readiness</strong>
        <span>${data.verifyTokenSet && data.accessTokenSet ? 'Ready' : 'Missing tokens'}</span>
        <code>Verify token: ${data.verifyTokenSet ? 'set' : 'NOT set'} · Access token: ${data.accessTokenSet ? 'set' : 'NOT set'} · App secret: ${data.appSecretSet ? 'set' : 'optional, not set'}</code>
      </div>
    `;
    whatsappStatusEl.appendChild(grid);

    const note = document.createElement('p');
    note.className = 'hint';
    note.innerHTML = `Webhook URL to enter in Meta:&nbsp;<code class="copyable">https://&lt;your-cloudflare-tunnel-url&gt;/webhooks/whatsapp</code>`;
    whatsappStatusEl.appendChild(note);
  } catch (err) {
    whatsappStatusEl.innerHTML = `<p class="hint err">Failed: ${escapeHtml(err.message)}</p>`;
  }
}

refreshWhatsappBtn?.addEventListener('click', loadWhatsAppStatus);
loadWhatsAppStatus();
