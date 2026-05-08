const messagesEl = document.getElementById('messages');
const formEl = document.getElementById('chat-form');
const inputEl = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');

function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.textContent = text;
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

async function loadExisting() {
  try {
    const res = await fetch('/api/customer/messages');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.messages?.length) {
      data.messages.forEach(m => addMessage(m.role, m.content));
    } else {
      addMessage('assistant', "Hi! I'm your frontdesk assistant. How can I help you today?");
    }
  } catch (err) {
    addMessage('error', `Couldn't load history: ${err.message}`);
  }
}

async function sendMessage(text) {
  addMessage('user', text);
  inputEl.value = '';
  sendBtn.disabled = true;
  showTyping();

  try {
    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });
    const data = await res.json();
    hideTyping();

    if (!res.ok || data.error) {
      addMessage('error', `Error: ${data.error || `HTTP ${res.status}`}`);
    } else {
      addMessage('assistant', data.reply);
    }
  } catch (err) {
    hideTyping();
    addMessage('error', `Network error: ${err.message}`);
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (text) sendMessage(text);
});

window.addEventListener('load', loadExisting);
