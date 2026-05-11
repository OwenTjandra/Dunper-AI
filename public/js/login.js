/* Two-step sign-in:
 *   step 1: POST /api/auth/login with { username, password }
 *           - if response.step === 'verify' → show step 2 with the email hint
 *           - if response.step === 'done' → redirect by role
 *   step 2: POST /api/auth/verify-2fa with { code }
 *           - on success → redirect by role
 */
const loginForm = document.getElementById('login-form');
const verifyForm = document.getElementById('verify-form');
const loginError = document.getElementById('login-error');
const verifyError = document.getElementById('verify-error');
const loginBtn = document.getElementById('login-btn');
const verifyBtn = document.getElementById('verify-btn');
const resendBtn = document.getElementById('resend-btn');
const backBtn = document.getElementById('back-btn');
const emailHintEl = document.getElementById('email-hint');

function showError(el, msg) {
  el.textContent = msg;
  el.classList.add('show');
}
function clearErr(el) {
  el.classList.remove('show');
  el.textContent = '';
}
function showStep(which) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(which).classList.add('active');
  if (which === 'verify-form') verifyForm.querySelector('input[name=code]').focus();
}
function dashboardFor(role) {
  return role === 'founder' ? '/operator.html' : '/admin.html';
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErr(loginError);
  loginBtn.disabled = true;
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        username: loginForm.username.value,
        password: loginForm.password.value,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      showError(loginError, data.error || 'Sign-in failed.');
      return;
    }
    if (data.step === 'verify') {
      emailHintEl.textContent = data.hint || 'your email';
      showStep('verify-form');
      return;
    }
    // No 2FA — fully signed in
    window.location.href = dashboardFor(data.user && data.user.role);
  } catch (err) {
    showError(loginError, 'Network error: ' + err.message);
  } finally {
    loginBtn.disabled = false;
  }
});

verifyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErr(verifyError);
  verifyBtn.disabled = true;
  try {
    const code = (verifyForm.code.value || '').replace(/\D/g, '');
    if (code.length !== 6) {
      showError(verifyError, 'Enter the 6-digit code from your email.');
      return;
    }
    const r = await fetch('/api/auth/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      showError(verifyError, data.error || 'Verification failed.');
      return;
    }
    window.location.href = dashboardFor(data.user && data.user.role);
  } catch (err) {
    showError(verifyError, 'Network error: ' + err.message);
  } finally {
    verifyBtn.disabled = false;
  }
});

resendBtn.addEventListener('click', async () => {
  clearErr(verifyError);
  resendBtn.disabled = true;
  try {
    const r = await fetch('/api/auth/resend-2fa', {
      method: 'POST',
      credentials: 'include',
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      showError(verifyError, data.error || 'Could not resend code.');
      return;
    }
    if (data.hint) emailHintEl.textContent = data.hint;
    showError(verifyError, 'New code sent.');
    verifyError.style.background = '#eef6ed';
    verifyError.style.color = '#2d7a2d';
    verifyError.style.borderColor = '#86d9aa';
    setTimeout(() => {
      verifyError.style.background = '';
      verifyError.style.color = '';
      verifyError.style.borderColor = '';
      clearErr(verifyError);
    }, 2500);
  } catch (err) {
    showError(verifyError, 'Network error: ' + err.message);
  } finally {
    resendBtn.disabled = false;
  }
});

backBtn.addEventListener('click', () => {
  verifyForm.reset();
  clearErr(verifyError);
  showStep('login-form');
  loginForm.username.focus();
});
