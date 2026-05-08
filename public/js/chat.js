const messagesEl = document.getElementById('messages');
const formEl = document.getElementById('chat-form');
const inputEl = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const attachmentBtn = document.getElementById('attachment-btn');
const attachmentInput = document.getElementById('attachment-input');
const previewEl = document.getElementById('attachment-preview');
const previewImg = document.getElementById('attachment-preview-img');
const previewName = document.getElementById('attachment-preview-name');
const previewClearBtn = document.getElementById('attachment-preview-clear');

let pendingFile = null;

function addMessage(role, text, attachments) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  if (attachments?.length) {
    attachments.forEach(a => {
      const img = document.createElement('img');
      img.className = 'attached';
      img.src = a.url;
      img.alt = a.filename;
      div.appendChild(img);
    });
  }
  if (text) {
    const span = document.createElement('span');
    span.textContent = text;
    div.appendChild(span);
  }
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'typing';
  div.id = 'typing-indicator';
  div.innerHTML = '<span></span><span></span><span></span>';
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function hideTyping() {
  document.getElementById('typing-indicator')?.remove();
}

function clearAttachment() {
  pendingFile = null;
  attachmentInput.value = '';
  previewEl.hidden = true;
  if (previewImg.src.startsWith('blob:')) URL.revokeObjectURL(previewImg.src);
  previewImg.src = '';
  previewName.textContent = '';
}

function setAttachment(file) {
  pendingFile = file;
  previewImg.src = URL.createObjectURL(file);
  previewName.textContent = file.name;
  previewEl.hidden = false;
}

attachmentBtn.addEventListener('click', () => attachmentInput.click());
attachmentInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) setAttachment(file);
});
previewClearBtn.addEventListener('click', clearAttachment);

let greetingMessageEl = null;
let initialGreetingShown = false;

async function loadExisting() {
  try {
    const res = await fetch('/api/customer/messages');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.messages?.length) {
      data.messages.forEach(m => addMessage(m.role, m.content, m.attachments));
    } else {
      greetingMessageEl = addMessage('assistant', t('greeting'));
      initialGreetingShown = true;
    }
  } catch (err) {
    addMessage('error', `${t('couldntLoadHistory')}: ${err.message}`);
  }
}

window.addEventListener('languagechange', () => {
  if (initialGreetingShown && greetingMessageEl) {
    const span = greetingMessageEl.querySelector('span') || greetingMessageEl;
    span.textContent = t('greeting');
  }
});

function autoSizeInput() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
}

inputEl.addEventListener('input', autoSizeInput);
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    formEl.requestSubmit();
  }
});

async function sendMessage(text, file) {
  const localAttachments = file ? [{ url: URL.createObjectURL(file), filename: file.name }] : null;
  addMessage('user', text, localAttachments);
  inputEl.value = '';
  autoSizeInput();
  clearAttachment();
  sendBtn.disabled = true;
  attachmentBtn.disabled = true;
  showTyping();

  try {
    const fd = new FormData();
    fd.append('message', text);
    if (file) fd.append('file', file);

    const res = await fetch('/chat', { method: 'POST', body: fd });
    const data = await res.json();
    hideTyping();

    if (!res.ok || data.error) {
      addMessage('error', `${t('error')}: ${data.error || `HTTP ${res.status}`}`);
    } else {
      addMessage('assistant', data.reply);
    }
  } catch (err) {
    hideTyping();
    addMessage('error', `${t('networkError')}: ${err.message}`);
  } finally {
    sendBtn.disabled = false;
    attachmentBtn.disabled = false;
    inputEl.focus();
  }
}

formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text && !pendingFile) return;
  sendMessage(text, pendingFile);
});

async function loadBusinessBranding() {
  try {
    const res = await fetch('/api/customer/business');
    if (!res.ok) return;
    const data = await res.json();
    const wa = (data.whatsapp_number || '').replace(/[^\d]/g, '');
    const waLink = document.getElementById('whatsapp-link');
    if (wa && waLink) {
      const prefill = data.whatsapp_prefill_message
        ? `?text=${encodeURIComponent(data.whatsapp_prefill_message)}`
        : '';
      waLink.href = `https://wa.me/${wa}${prefill}`;
      waLink.hidden = false;
    }
    const logoImg = document.getElementById('brand-logo-img');
    const logoFallback = document.getElementById('brand-logo-fallback');
    if (data.logo_url && logoImg && logoFallback) {
      logoImg.src = data.logo_url;
      logoImg.hidden = false;
      logoFallback.hidden = true;
    }
    if (data.name) {
      const titleEl = document.querySelector('.header-text h1');
      if (titleEl) titleEl.textContent = data.name;
      document.title = `${data.name} — Dunper AI`;
    }
  } catch {}
}

window.addEventListener('load', () => { loadBusinessBranding(); loadExisting(); });

window.appendBookingConfirmation = function (booking) {
  const lang = (window.getCurrentLang && window.getCurrentLang()) || 'en';
  const localeMap = { en: 'en-US', id: 'id-ID', ms: 'ms-MY' };
  const locale = localeMap[lang] || undefined;
  const start = new Date(booking.starts_at);
  const dateStr = start.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = start.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  addMessage('assistant', `✓ ${t('booked')}: ${booking.service_name} — ${dateStr} ${timeStr}. ${t('seeYouThen')}`);
};
