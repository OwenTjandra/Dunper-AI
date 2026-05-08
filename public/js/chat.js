const messagesEl = document.getElementById('messages');
const formEl = document.getElementById('chat-form');
const inputEl = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');

const history = [];

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

async function sendMessage(text) {
  history.push({ role: 'user', content: text });
  addMessage('user', text);

  inputEl.value = '';
  sendBtn.disabled = true;
  showTyping();

  try {
    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });
    const data = await res.json();
    hideTyping();

    if (data.error) {
      addMessage('error', `Error: ${data.error}`);
      history.pop();
    } else {
      history.push({ role: 'assistant', content: data.reply });
      addMessage('assistant', data.reply);
    }
  } catch (err) {
    hideTyping();
    addMessage('error', `Network error: ${err.message}`);
    history.pop();
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

window.addEventListener('load', () => {
  addMessage('assistant', "Hi! I'm your frontdesk assistant. How can I help you today?");
});
