const form = document.getElementById('login-form');
const errorEl = document.getElementById('login-error');
const btn = document.getElementById('login-btn');

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.add('show');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.classList.remove('show');
  btn.disabled = true;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.username.value,
        password: form.password.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || 'Sign-in failed');
      return;
    }
    window.location.href = '/admin.html';
  } catch (err) {
    showError(`Network error: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
});
