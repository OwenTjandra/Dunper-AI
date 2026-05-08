const modal = document.getElementById('booking-modal');
const openBtn = document.getElementById('open-booking-btn');
const closeBtn = document.getElementById('booking-close');
const form = document.getElementById('booking-form');
const serviceEl = document.getElementById('booking-service');
const dateEl = document.getElementById('booking-date');
const slotsEl = document.getElementById('booking-slots');
const nameEl = document.getElementById('booking-name');
const phoneEl = document.getElementById('booking-phone');
const submitBtn = document.getElementById('booking-submit');
const statusEl = document.getElementById('booking-status');

let services = [];
let selectedSlot = null;

function todayStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function maxStr() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

async function loadServices() {
  try {
    const res = await fetch('/api/customer/business');
    const data = await res.json();
    services = data.services || [];
    serviceEl.innerHTML = '';
    services.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = `${s.name} — ${s.duration_minutes} min, ${s.price}`;
      serviceEl.appendChild(opt);
    });
  } catch (err) {
    setStatus(`Failed to load services: ${err.message}`, 'err');
  }
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = `status ${kind || ''}`;
}

function openModal() {
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  if (services.length === 0) loadServices();
  if (!dateEl.value) {
    dateEl.min = todayStr();
    dateEl.max = maxStr();
    dateEl.value = todayStr();
    refreshSlots();
  }
}

function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = '';
  setStatus('', '');
}

async function refreshSlots() {
  selectedSlot = null;
  submitBtn.disabled = true;
  if (!dateEl.value || !serviceEl.value) {
    slotsEl.innerHTML = '<p class="hint">Pick a date and service to see times.</p>';
    return;
  }
  slotsEl.innerHTML = '<p class="hint">Loading…</p>';
  try {
    const url = `/api/customer/availability?date=${encodeURIComponent(dateEl.value)}&service=${encodeURIComponent(serviceEl.value)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (data.reason || (data.slots && data.slots.length === 0)) {
      slotsEl.innerHTML = `<p class="hint">${data.reason || 'No available times — try another day.'}</p>`;
      return;
    }
    slotsEl.innerHTML = '';
    data.slots.forEach(time => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot';
      btn.textContent = time;
      btn.addEventListener('click', () => {
        slotsEl.querySelectorAll('.slot').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedSlot = time;
        submitBtn.disabled = false;
      });
      slotsEl.appendChild(btn);
    });
  } catch (err) {
    slotsEl.innerHTML = `<p class="hint err">${err.message}</p>`;
  }
}

openBtn.addEventListener('click', openModal);
closeBtn.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
serviceEl.addEventListener('change', refreshSlots);
dateEl.addEventListener('change', refreshSlots);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedSlot) return;
  submitBtn.disabled = true;
  setStatus('Booking…', '');
  try {
    const res = await fetch('/api/customer/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: serviceEl.value,
        date: dateEl.value,
        time: selectedSlot,
        name: nameEl.value.trim(),
        phone: phoneEl.value.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    setStatus('Booked!', 'ok');
    if (window.appendBookingConfirmation) {
      window.appendBookingConfirmation(data.booking);
    }
    setTimeout(closeModal, 600);
  } catch (err) {
    setStatus(err.message, 'err');
    submitBtn.disabled = false;
    refreshSlots();
  }
});
