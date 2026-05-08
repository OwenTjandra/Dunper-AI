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

function fillForm(b) {
  form.name.value = b.name || '';
  form.type.value = b.type || '';
  form.hours.value = b.hours || '';
  form.address.value = b.address || '';
  form.phone.value = b.phone || '';
  form.tone.value = b.tone || '';
  form.fallback_contact.value = b.fallback_contact || '';

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

  return {
    name: form.name.value.trim(),
    type: form.type.value.trim(),
    hours: form.hours.value.trim(),
    address: form.address.value.trim(),
    phone: form.phone.value.trim(),
    tone: form.tone.value.trim(),
    fallback_contact: form.fallback_contact.value.trim(),
    services,
    booking_rules,
  };
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
