/* Dunper AI — Embeddable chat widget
 *
 * Drop this script onto any client's site to add a floating chat bubble
 * in the bottom-right corner. Clicking the bubble opens a 400×640 panel
 * that iframes the Dunper chat. Esc / × / backdrop closes.
 *
 * Embed:
 *   <script>
 *     window.DUNPER_CHAT_URL = 'https://your-dunper-instance.example.com';
 *     window.DUNPER_LABEL    = 'Chat with us';   // optional
 *   </script>
 *   <script src="https://dunper.com/js/dunper-widget.js" defer></script>
 *
 * The widget is self-contained — no external CSS/JS dependencies. It
 * is also idempotent: loading the script twice on the same page is a
 * no-op.
 */
(function () {
  if (window.__dunperWidgetMounted) return;
  window.__dunperWidgetMounted = true;

  const CHAT_URL  = (window.DUNPER_CHAT_URL  || 'dunper_chat.html').toString();
  const LABEL     = window.DUNPER_LABEL      || 'Chat with Dunper';
  const SUBTITLE  = window.DUNPER_SUBTITLE   || 'Live chat · we usually reply in seconds';
  const LOGO_URL  = window.DUNPER_LOGO_URL   || 'img/logo-nav.png';

  const css = `
    .dunper-fab {
      position: fixed; right: 22px; bottom: 22px; z-index: 99998;
      width: 60px; height: 60px; border-radius: 50%; border: none; cursor: pointer;
      background: #0A1430;
      box-shadow: 0 12px 30px rgba(10,20,48,.28), 0 0 0 0 rgba(30,58,138,.45);
      display: flex; align-items: center; justify-content: center;
      font-family: 'Outfit', system-ui, -apple-system, sans-serif;
      transition: transform .2s ease, box-shadow .25s ease;
      animation: dunperFabPulse 2.6s ease-in-out infinite;
    }
    .dunper-fab:hover { transform: scale(1.06); }
    .dunper-fab svg { width: 26px; height: 26px; fill: #fff; }
    @keyframes dunperFabPulse {
      0%,100% { box-shadow: 0 12px 30px rgba(10,20,48,.28), 0 0 0 0 rgba(30,58,138,.45); }
      50%     { box-shadow: 0 12px 30px rgba(10,20,48,.28), 0 0 0 16px rgba(30,58,138,0); }
    }

    .dunper-fab-label {
      position: fixed; right: 96px; bottom: 36px; z-index: 99998;
      background: #FFFFFF; color: #0A1430;
      font-family: 'Outfit', system-ui, -apple-system, sans-serif;
      font-size: 13px; font-weight: 500;
      padding: 9px 14px; border-radius: 24px;
      border: 1px solid rgba(15,23,42,0.08);
      box-shadow: 0 8px 22px rgba(15,23,42,0.10);
      pointer-events: none; white-space: nowrap;
      opacity: 0; transform: translateX(8px);
      transition: opacity .25s, transform .25s;
    }
    .dunper-fab:hover + .dunper-fab-label,
    .dunper-fab-label.show { opacity: 1; transform: translateX(0); }

    .dunper-overlay {
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(10,20,48,.45);
      backdrop-filter: blur(4px);
      opacity: 0; pointer-events: none;
      transition: opacity .25s ease;
    }
    .dunper-overlay.open { opacity: 1; pointer-events: auto; }

    .dunper-panel {
      position: fixed; right: 22px; bottom: 22px; z-index: 100000;
      width: 400px; height: min(640px, calc(100vh - 44px));
      background: #FFFFFF; color: #0A1430;
      border: 1px solid rgba(15,23,42,0.06);
      border-radius: 22px; overflow: hidden;
      box-shadow: 0 30px 80px rgba(10,20,48,0.32);
      display: flex; flex-direction: column;
      transform: translateY(20px) scale(.98); opacity: 0;
      transition: transform .3s cubic-bezier(.16,1,.3,1), opacity .25s;
      pointer-events: none;
      font-family: 'Outfit', system-ui, -apple-system, sans-serif;
    }
    .dunper-panel.open { transform: translateY(0) scale(1); opacity: 1; pointer-events: auto; }

    .dunper-panel-head {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(15,23,42,0.06);
      background: #FFFFFF;
    }
    .dunper-panel-head img {
      width: 32px; height: 32px; object-fit: contain;
      flex-shrink: 0;
    }
    .dunper-panel-head .title {
      flex: 1; font-weight: 700; font-size: 15px; color: #0A1430;
      letter-spacing: -0.01em;
    }
    .dunper-panel-head .subtitle {
      display: block;
      font-weight: 400; font-size: 11px;
      color: #475569; margin-top: 2px;
      letter-spacing: 0;
    }
    .dunper-icon-btn {
      background: none; border: none; cursor: pointer;
      width: 32px; height: 32px; border-radius: 10px;
      color: #475569; font-size: 22px; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      transition: background .2s, color .2s;
    }
    .dunper-icon-btn:hover { background: rgba(15,23,42,0.06); color: #0A1430; }

    .dunper-panel-body { position: relative; flex: 1; background: #FFFFFF; }
    .dunper-panel-body iframe { width: 100%; height: 100%; border: 0; background: #FFFFFF; }

    .dunper-loading {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 14px;
      background: #FFFFFF; color: #475569;
      font-size: 13.5px;
      transition: opacity .3s;
    }
    .dunper-loading.gone { opacity: 0; pointer-events: none; }
    .dunper-spinner {
      width: 32px; height: 32px;
      border: 3px solid rgba(15,23,42,0.10); border-top-color: #1E3A8A;
      border-radius: 50%; animation: dunperSpin 1s linear infinite;
    }
    @keyframes dunperSpin { to { transform: rotate(360deg); } }

    .dunper-fallback {
      position: absolute; inset: 0; display: none;
      flex-direction: column; align-items: center; justify-content: center;
      gap: 14px; padding: 24px; text-align: center;
      background: #FFFFFF; color: #475569; font-size: 13.5px;
    }
    .dunper-fallback.show { display: flex; }
    .dunper-fallback strong { color: #0A1430; font-size: 15px; font-weight: 600; }
    .dunper-fallback a {
      display: inline-block; margin-top: 6px;
      background: #0A1430;
      color: #fff; padding: 11px 22px; border-radius: 50px;
      font-weight: 500; font-size: 13.5px; text-decoration: none;
      box-shadow: 0 6px 16px rgba(10,20,48,0.2);
    }
    .dunper-fallback a:hover { background: #1E3A8A; }

    @media (max-width: 600px) {
      .dunper-panel {
        right: 0; bottom: 0; left: 0; top: 0;
        width: 100%; height: 100%; border-radius: 0;
      }
      .dunper-fab { right: 16px; bottom: 16px; width: 56px; height: 56px; }
      .dunper-fab-label { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .dunper-fab { animation: none !important; }
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  const fab = document.createElement('button');
  fab.className = 'dunper-fab';
  fab.setAttribute('aria-label', LABEL);
  fab.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2zm3 6v2h2v-2H7zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2z"/></svg>';

  const fabLabel = document.createElement('div');
  fabLabel.className = 'dunper-fab-label';
  fabLabel.textContent = LABEL;

  const overlay = document.createElement('div');
  overlay.className = 'dunper-overlay';

  const panel = document.createElement('div');
  panel.className = 'dunper-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Dunper AI live chat');
  panel.innerHTML = `
    <div class="dunper-panel-head">
      <img src="${LOGO_URL}" alt="" onerror="this.style.display='none'"/>
      <div class="title">Dunper AI<span class="subtitle">${SUBTITLE}</span></div>
      <button class="dunper-icon-btn" data-dunper-close title="Close" aria-label="Close">×</button>
    </div>
    <div class="dunper-panel-body">
      <div class="dunper-loading"><div class="dunper-spinner"></div><span>Connecting…</span></div>
      <div class="dunper-fallback">
        <strong>Couldn't open the live chat here.</strong>
        <span>This usually means iframes are blocked. Open it in a new tab — same conversation.</span>
        <a href="${CHAT_URL}" target="_blank" rel="noopener">Open Dunper in a new tab →</a>
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
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'Dunper AI live chat');
    iframe.setAttribute('allow', 'microphone; clipboard-read; clipboard-write');
    iframe.src = CHAT_URL;
    iframe.addEventListener('load', () => {
      if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
      loading.classList.add('gone');
    });
    body.insertBefore(iframe, loading);
    loadTimer = setTimeout(() => {
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
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('open')) close();
  });

  // Any element on the host page with [data-dunper-open] or .dunper-open
  // will open the widget on click.
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-dunper-open], .dunper-open');
    if (trigger) {
      e.preventDefault();
      open();
    }
  });

  window.openDunperWidget = open;
  window.closeDunperWidget = close;
})();
