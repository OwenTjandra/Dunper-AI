// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// Wire the demo URL into both the iframe and the "Open in tab" button
const DEMO_URL = window.DUNPER_DEMO_URL || '';
const demoFrame = document.getElementById('demo-frame');
const openTabBtn = document.getElementById('open-demo-tab');

if (DEMO_URL) {
  if (demoFrame) demoFrame.src = DEMO_URL;
  if (openTabBtn) openTabBtn.href = DEMO_URL;
} else {
  if (demoFrame) {
    const wrap = demoFrame.parentElement;
    wrap.innerHTML = '<div style="padding:48px;text-align:center;color:#64748b;">Demo URL not configured — see <code>window.DUNPER_DEMO_URL</code> in the page source.</div>';
  }
  if (openTabBtn) {
    openTabBtn.style.display = 'none';
  }
}

// Contact form: AJAX to formsubmit.co so we don't navigate away
const form = document.getElementById('contact-form');
const statusEl = document.getElementById('form-status');
const submitBtn = document.getElementById('submit-btn');

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (statusEl) {
      statusEl.textContent = 'Sending…';
      statusEl.className = 'form-status';
    }
    submitBtn.disabled = true;

    try {
      const fd = new FormData(form);
      const res = await fetch(form.action, {
        method: 'POST',
        body: fd,
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      form.reset();
      if (statusEl) {
        statusEl.textContent = "Thanks! We'll be in touch within one business day.";
        statusEl.className = 'form-status ok';
      }
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = `Couldn't send — ${err.message}. Email us directly at dunperai@gmail.com.`;
        statusEl.className = 'form-status err';
      }
    } finally {
      submitBtn.disabled = false;
    }
  });
}
