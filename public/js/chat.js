const messagesEl = document.getElementById('messages');
const formEl = document.getElementById('chat-form');
const inputEl = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const attachmentBtn = document.getElementById('attachment-btn');
const attachmentInput = document.getElementById('attachment-input');
const previewEl = document.getElementById('attachment-preview');

const MAX_ATTACHMENTS = 10;
const pendingFiles = [];
const pendingPreviewUrls = new Map();

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

function clearAttachment(file) {
  if (file) {
    const idx = pendingFiles.indexOf(file);
    if (idx >= 0) pendingFiles.splice(idx, 1);
    const url = pendingPreviewUrls.get(file);
    if (url) {
      URL.revokeObjectURL(url);
      pendingPreviewUrls.delete(file);
    }
  } else {
    pendingFiles.length = 0;
    pendingPreviewUrls.forEach(URL.revokeObjectURL);
    pendingPreviewUrls.clear();
  }
  attachmentInput.value = '';
  renderPreviews();
}

function renderPreviews() {
  previewEl.innerHTML = '';
  if (pendingFiles.length === 0) {
    previewEl.hidden = true;
    return;
  }
  previewEl.hidden = false;
  pendingFiles.forEach(file => {
    const item = document.createElement('div');
    item.className = 'preview-item';

    const img = document.createElement('img');
    img.src = pendingPreviewUrls.get(file);
    img.alt = file.name;
    item.appendChild(img);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'preview-remove';
    removeBtn.textContent = '×';
    removeBtn.title = file.name;
    removeBtn.addEventListener('click', () => clearAttachment(file));
    item.appendChild(removeBtn);

    previewEl.appendChild(item);
  });
}

function addAttachment(file) {
  if (pendingFiles.length >= MAX_ATTACHMENTS) return;
  pendingFiles.push(file);
  pendingPreviewUrls.set(file, URL.createObjectURL(file));
  renderPreviews();
}

attachmentBtn.addEventListener('click', () => attachmentInput.click());
attachmentInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []);
  files.forEach(addAttachment);
});

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

async function sendMessage(text, files) {
  const filesCopy = files.slice();
  const localAttachments = filesCopy.map(f => ({
    url: URL.createObjectURL(f),
    filename: f.name,
  }));
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
    filesCopy.forEach(f => fd.append('files', f));

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
  if (!text && pendingFiles.length === 0) return;
  sendMessage(text, pendingFiles);
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
    const avatarImg = document.getElementById('business-avatar-img');
    const avatarFallback = document.getElementById('business-avatar-fallback');
    if (data.logo_url && avatarImg && avatarFallback) {
      avatarImg.src = data.logo_url;
      avatarImg.hidden = false;
      avatarFallback.hidden = true;
    } else if (data.name && avatarFallback) {
      avatarFallback.textContent = data.name.trim().charAt(0).toUpperCase();
    }
    if (data.name) {
      const titleEl = document.querySelector('.header-text h1');
      if (titleEl) titleEl.textContent = data.name;
      document.title = `${data.name} — Dunper AI`;
    }
  } catch {}
}

window.addEventListener('load', () => { loadBusinessBranding(); loadExisting(); });

const handoffBtn = document.getElementById('handoff-btn');
handoffBtn?.addEventListener('click', async () => {
  handoffBtn.disabled = true;
  try {
    const res = await fetch('/api/customer/escalate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Requested from chat header' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    addMessage('assistant', t('handoffSent'));
  } catch (err) {
    addMessage('error', `${t('handoffFailed')}: ${err.message}`);
  } finally {
    setTimeout(() => { handoffBtn.disabled = false; }, 30000);
  }
});

window.appendBookingConfirmation = function (booking) {
  const lang = (window.getCurrentLang && window.getCurrentLang()) || 'en';
  const localeMap = { en: 'en-US', id: 'id-ID', ms: 'ms-MY' };
  const locale = localeMap[lang] || undefined;
  const start = new Date(booking.starts_at);
  const dateStr = start.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = start.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  addMessage('assistant', `✓ ${t('booked')}: ${booking.service_name} — ${dateStr} ${timeStr}. ${t('seeYouThen')}`);
};
