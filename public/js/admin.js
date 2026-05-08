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

async function loadBusiness() {
  try {
    const res = await fetch('/api/business');
    const data = await res.json();
    fillForm(data);
  } catch (err) {
    setStatus(`Failed to load: ${err.message}`, 'err');
  }
}

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
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed');
    setStatus('Saved ✓', 'ok');
  } catch (err) {
    setStatus(err.message, 'err');
  } finally {
    saveBtn.disabled = false;
  }
});

loadBusiness();
