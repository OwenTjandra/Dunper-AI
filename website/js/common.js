/* Dunper marketing site — shared JS
 *
 * Edit DEMO_URL when the Cloudflare quick-tunnel rotates, or when you set up
 * a permanent named tunnel (e.g. https://app.dunper.com).
 *
 * Provides:
 *   - Nav chatbar (existing): pressing Enter or clicking send opens the demo
 *     in a new tab and stashes the typed question in sessionStorage.
 *   - Floating "Try Dunper" widget (new): a bottom-right chat bubble that
 *     expands into a panel containing a live iframe of the chatbot. Lets
 *     visitors try Dunper without leaving the marketing site.
 *
 * Any element with [data-dunper-open] (or class "dunper-open") will also
 * open the panel when clicked.
 */
const DEMO_URL = 'https://equally-logic-theta-mysql.trycloudflare.com';

// ===== Nav chatbar =====
(function () {
  const bar = document.getElementById('nav-chatbar');
  if (!bar) return;
  const input = bar.querySelector('input');

  bar.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = (input.value || '').trim();
    if (q) {
      try { sessionStorage.setItem('dunper_pending_question', q); } catch {}
    }
    input.value = '';
    // Open the live demo in the floating widget if available, else new tab.
    if (window.openDunperChat) window.openDunperChat();
    else window.open(DEMO_URL, '_blank', 'noopener');
  });
})();

// ===== Floating chat widget =====
(function () {
  if (window.__dunperWidgetMounted) return;
  window.__dunperWidgetMounted = true;

  const css = `
    .dunper-fab {
      position: fixed; right: 22px; bottom: 22px; z-index: 9998;
      width: 60px; height: 60px; border-radius: 50%; border: none; cursor: pointer;
      background: linear-gradient(135deg, #2563A8, #4FC3F7);
      box-shadow: 0 10px 30px rgba(0,0,0,.35), 0 0 0 0 rgba(79,195,247,.45);
      display: flex; align-items: center; justify-content: center;
      transition: transform .2s ease, box-shadow .25s ease;
      animation: dunperFabPulse 2.4s ease-in-out infinite;
    }
    .dunper-fab:hover { transform: scale(1.06); }
    .dunper-fab svg { width: 26px; height: 26px; fill: #fff; }
    @keyframes dunperFabPulse {
      0%,100% { box-shadow: 0 10px 30px rgba(0,0,0,.35), 0 0 0 0 rgba(79,195,247,.45); }
      50%     { box-shadow: 0 10px 30px rgba(0,0,0,.35), 0 0 0 14px rgba(79,195,247,0); }
    }
    .dunper-fab-label {
      position: fixed; right: 92px; bottom: 32px; z-index: 9998;
      background: #0D1B2A; color: #F0F6FF;
      font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500;
      padding: 9px 14px; border-radius: 22px;
      border: 1px solid rgba(91,142,212,.25);
      box-shadow: 0 6px 20px rgba(0,0,0,.3);
      pointer-events: none;
      opacity: 0; transform: translateX(8px); transition: opacity .25s, transform .25s;
      white-space: nowrap;
    }
    .dunper-fab:hover + .dunper-fab-label,
    .dunper-fab-label.show { opacity: 1; transform: translateX(0); }

    .dunper-overlay {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(13,27,42,.55);
      backdrop-filter: blur(4px);
      opacity: 0; pointer-events: none;
      transition: opacity .25s ease;
    }
    .dunper-overlay.open { opacity: 1; pointer-events: auto; }

    .dunper-panel {
      position: fixed; right: 22px; bottom: 22px; z-index: 10000;
      width: 400px; height: min(620px, calc(100vh - 44px));
      background: #0D1B2A; color: #F0F6FF;
      border: 1px solid rgba(91,142,212,.25);
      border-radius: 22px; overflow: hidden;
      box-shadow: 0 30px 80px rgba(0,0,0,.55);
      display: flex; flex-direction: column;
      transform: translateY(20px) scale(.98); opacity: 0;
      transition: transform .3s cubic-bezier(.2,.8,.2,1), opacity .25s;
      pointer-events: none;
    }
    .dunper-panel.open { transform: translateY(0) scale(1); opacity: 1; pointer-events: auto; }

    .dunper-panel-head {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(91,142,212,.18);
      background: linear-gradient(180deg, rgba(37,99,168,.18), transparent);
    }
    .dunper-panel-head .dunper-logo-icon {
      width: 28px; height: 28px;
      background: linear-gradient(135deg, #2563A8, #4FC3F7);
      clip-path: polygon(50% 0%, 95% 30%, 80% 100%, 20% 100%, 5% 30%);
      flex-shrink: 0;
    }
    .dunper-panel-head .title {
      flex: 1; font-family: 'Syne', sans-serif; font-weight: 700; font-size: 16px;
    }
    .dunper-panel-head .subtitle {
      display: block;
      font-family: 'DM Sans', sans-serif; font-weight: 400; font-size: 11px;
      color: #5B8ED4; margin-top: 1px;
    }
    .dunper-panel-actions { display: flex; align-items: center; gap: 4px; }
    .dunper-icon-btn {
      background: none; border: none; cursor: pointer;
      width: 32px; height: 32px; border-radius: 8px;
      color: #A8C7F0; font-size: 18px; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      transition: background .2s, color .2s;
    }
    .dunper-icon-btn:hover { background: rgba(91,142,212,.14); color: #fff; }

    .dunper-panel-body { position: relative; flex: 1; background: #0D1B2A; }
    .dunper-panel-body iframe {
      width: 100%; height: 100%; border: 0;
      background: #0D1B2A;
    }

    .dunper-loading {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 14px;
      background: #0D1B2A; color: #A8C7F0;
      font-family: 'DM Sans', sans-serif; font-size: 14px;
      transition: opacity .3s;
    }
    .dunper-loading.gone { opacity: 0; pointer-events: none; }
    .dunper-spinner {
      width: 32px; height: 32px;
      border: 3px solid rgba(91,142,212,.25); border-top-color: #4FC3F7;
      border-radius: 50%; animation: dunperSpin 1s linear infinite;
    }
    @keyframes dunperSpin { to { transform: rotate(360deg); } }

    .dunper-fallback {
      position: absolute; inset: 0; display: none;
      flex-direction: column; align-items: center; justify-content: center;
      gap: 14px; padding: 24px; text-align: center;
      background: #0D1B2A; color: #A8C7F0;
      font-family: 'DM Sans', sans-serif; font-size: 14px;
    }
    .dunper-fallback.show { display: flex; }
    .dunper-fallback strong { color: #F0F6FF; font-size: 15px; }
    .dunper-fallback a {
      display: inline-block; margin-top: 6px;
      background: linear-gradient(135deg, #2563A8, #4FC3F7);
      color: #fff; padding: 11px 20px; border-radius: 50px;
      font-weight: 500; font-size: 14px; text-decoration: none;
    }

    @media (max-width: 600px) {
      .dunper-panel {
        right: 0; bottom: 0; left: 0; top: 0;
        width: 100%; height: 100%; border-radius: 0;
      }
      .dunper-fab { right: 16px; bottom: 16px; width: 56px; height: 56px; }
      .dunper-fab-label { display: none; }
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  const fab = document.createElement('button');
  fab.className = 'dunper-fab';
  fab.setAttribute('aria-label', 'Try Dunper AI');
  fab.innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2zm3 6v2h2v-2H7zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2z"/></svg>`;

  const fabLabel = document.createElement('div');
  fabLabel.className = 'dunper-fab-label';
  fabLabel.textContent = 'Try Dunper AI';

  const overlay = document.createElement('div');
  overlay.className = 'dunper-overlay';

  const panel = document.createElement('div');
  panel.className = 'dunper-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Dunper AI live demo');
  panel.innerHTML = `
    <div class="dunper-panel-head">
      <div class="dunper-logo-icon"></div>
      <div class="title">Dunper AI<span class="subtitle">Live demo · ask anything</span></div>
      <div class="dunper-panel-actions">
        <button class="dunper-icon-btn" data-dunper-popout title="Open in new tab" aria-label="Open in new tab">↗</button>
        <button class="dunper-icon-btn" data-dunper-close title="Close" aria-label="Close">×</button>
      </div>
    </div>
    <div class="dunper-panel-body">
      <div class="dunper-loading"><div class="dunper-spinner"></div><span>Connecting to the live demo…</span></div>
      <div class="dunper-fallback">
        <strong>Live demo couldn't load in this window.</strong>
        <span>This usually means the tunnel is rotating or your network is blocking iframes. Open it in a new tab instead — works the same.</span>
        <a href="${DEMO_URL}" target="_blank" rel="noopener">Open Dunper in a new tab →</a>
      </div>
    </div>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(fabLabel);
  document.body.appendChild(overlay);
  document.body.appendChild(panel);

  const body = panel.querySelector('.dunper-panel-body');
  const loading = panel.querySelector('.dunper-loading');
  const fallback = panel.querySelector('.dunper-fallback');

  let iframeMounted = false;
  let loadTimer = null;

  function ensureIframe() {
    if (iframeMounted) return;
    iframeMounted = true;
    let url = DEMO_URL;
    try {
      const q = sessionStorage.getItem('dunper_pending_question');
      if (q) {
        url += (DEMO_URL.includes('?') ? '&' : '?') + 'q=' + encodeURIComponent(q);
      }
    } catch {}
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'Dunper AI live demo');
    iframe.setAttribute('allow', 'microphone; camera; clipboard-read; clipboard-write');
    iframe.src = url;
    iframe.addEventListener('load', () => {
      if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
      loading.classList.add('gone');
    });
    body.insertBefore(iframe, loading);
    loadTimer = setTimeout(() => {
      // If iframe hasn't fired load after 8s, assume it's blocked or stalled.
      if (!loading.classList.contains('gone')) {
        loading.classList.add('gone');
        fallback.classList.add('show');
      }
    }, 8000);
  }

  function open() {
    overlay.classList.add('open');
    panel.classList.add('open');
    ensureIframe();
  }
  function close() {
    overlay.classList.remove('open');
    panel.classList.remove('open');
  }

  fab.addEventListener('click', open);
  overlay.addEventListener('click', close);
  panel.querySelector('[data-dunper-close]').addEventListener('click', close);
  panel.querySelector('[data-dunper-popout]').addEventListener('click', () => {
    window.open(DEMO_URL, '_blank', 'noopener');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('open')) close();
  });

  // Any element marked with [data-dunper-open] or class "dunper-open" opens the panel.
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-dunper-open], .dunper-open');
    if (trigger) {
      e.preventDefault();
      open();
    }
  });

  window.openDunperChat = open;
  window.closeDunperChat = close;
})();
