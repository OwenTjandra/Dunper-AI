/* Dunper AI — Client chat widget (ROUGH DRAFT)
 *
 * This is the widget Dunper hands to paying clients to embed on their own
 * site. It has its own UI (so each client can theme it to their brand) and
 * talks to the Dunper backend over a small REST surface. Every feature of
 * the Dunper chatbot is reachable from here:
 *
 *   - text messages (send/receive)
 *   - file/image attachments
 *   - bookings (see availability, pick slot, confirm)
 *   - lead qualification (collect name / email / phone)
 *   - language switching (auto + 60+ languages)
 *   - human handoff banner ("a teammate is taking over…")
 *   - quick replies the bot suggests
 *   - persistent customer profile (localStorage)
 *   - branded greeting / colours / logo per tenant
 *
 * Embed:
 *   <script>
 *     window.DUNPER = {
 *       tenantId:      'biz_abc123',     // REQUIRED — tells Dunper which business
 *       primaryColor:  '#FF6B35',        // optional — bubble + outgoing bubble
 *       accentColor:   '#1E3A8A',        // optional — links + action chips
 *       businessName:  'Acme Dental',    // header title
 *       greeting:      'Hi! Need help?', // first bot message
 *       locale:        'auto',           // or 'en' / 'id' / 'es' …
 *       position:      'right',          // or 'left'
 *       apiBase:       'https://api.dunper.com'
 *     };
 *   </script>
 *   <script src="https://widget.dunper.com/v1/dunper.js" defer></script>
 *
 * Status: ROUGH DRAFT — design will be replaced. Backend wiring uses mock
 * responses so you can demo without a live API. Search "// BACKEND HOOK"
 * for the four real network calls.
 */
(function () {
  if (window.__dunperClientWidget) return;
  window.__dunperClientWidget = true;

  // ---------- Config ----------
  const _u = window.DUNPER || {};
  const cfg = {
    tenantId:      _u.tenantId      || 'demo',
    primaryColor:  _u.primaryColor  || '#0A1430',
    accentColor:   _u.accentColor   || '#1E3A8A',
    businessName:  _u.businessName  || 'Dunper AI',
    greeting:      _u.greeting      || "Hi! 👋 I'm Dunper, your AI assistant. How can I help today?",
    locale:        _u.locale        || 'auto',
    position:      _u.position === 'left' ? 'left' : 'right',
    apiBase:       _u.apiBase       || 'https://api.dunper.com',
    logoUrl:       _u.logoUrl       || null,
  };

  // ---------- Persistent state ----------
  const STORAGE_KEY = 'dunper_session_' + cfg.tenantId;
  const state = {
    open: false,
    messages: [],
    sending: false,
    profile: null,           // { id, name, email, phone, locale }
    sessionId: null,
    languages: [
      { code: 'en', label: 'English' },
      { code: 'id', label: 'Bahasa Indonesia' },
      { code: 'es', label: 'Español' },
      { code: 'zh', label: '中文' },
      { code: 'ar', label: 'العربية' },
      { code: 'tl', label: 'Tagalog' },
    ],
    activeLocale: 'en',
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved.profile)   state.profile   = saved.profile;
    if (saved.sessionId) state.sessionId = saved.sessionId;
    if (saved.messages)  state.messages  = saved.messages;
    if (saved.locale)    state.activeLocale = saved.locale;
  } catch {}
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        profile: state.profile,
        sessionId: state.sessionId,
        messages: state.messages.slice(-50), // cap history
        locale: state.activeLocale,
      }));
    } catch {}
  }

  // ---------- Styles ----------
  const css = `
    .dwc-fab {
      position: fixed; ${cfg.position}: 22px; bottom: 22px; z-index: 99998;
      width: 60px; height: 60px; border-radius: 50%; border: none; cursor: pointer;
      background: ${cfg.primaryColor};
      color: #fff;
      box-shadow: 0 12px 30px rgba(10,20,48,.28);
      display: flex; align-items: center; justify-content: center;
      font-family: 'Inter', 'Outfit', system-ui, sans-serif;
      transition: transform .2s ease;
    }
    .dwc-fab:hover { transform: scale(1.06); }
    .dwc-fab svg { width: 26px; height: 26px; fill: #fff; }
    .dwc-fab .dwc-unread {
      position: absolute; top: -2px; right: -2px;
      min-width: 18px; height: 18px; border-radius: 9px;
      background: #FB7185; color: #fff;
      font-size: 11px; font-weight: 600;
      display: none; align-items: center; justify-content: center;
      padding: 0 5px; border: 2px solid #fff;
    }
    .dwc-fab .dwc-unread.show { display: flex; }

    .dwc-panel {
      position: fixed; ${cfg.position}: 22px; bottom: 22px; z-index: 100000;
      width: 380px; height: min(640px, calc(100vh - 44px));
      background: #FFFFFF; color: #0A1430;
      border: 1px solid rgba(15,23,42,0.06);
      border-radius: 20px; overflow: hidden;
      box-shadow: 0 30px 80px rgba(10,20,48,0.30);
      display: flex; flex-direction: column;
      font-family: 'Inter', 'Outfit', system-ui, sans-serif;
      transform: translateY(20px) scale(.98); opacity: 0;
      transition: transform .3s cubic-bezier(.16,1,.3,1), opacity .25s;
      pointer-events: none;
    }
    .dwc-panel.open { transform: none; opacity: 1; pointer-events: auto; }

    /* Header */
    .dwc-head {
      padding: 14px 16px; display: flex; align-items: center; gap: 12px;
      background: ${cfg.primaryColor}; color: #fff;
    }
    .dwc-head .logo {
      width: 36px; height: 36px; border-radius: 50%; background: #fff;
      display: flex; align-items: center; justify-content: center;
      color: ${cfg.primaryColor}; font-weight: 700; font-size: 15px;
      overflow: hidden; flex-shrink: 0;
    }
    .dwc-head .logo img { width: 100%; height: 100%; object-fit: contain; padding: 4px; }
    .dwc-head .title { flex: 1; line-height: 1.2; }
    .dwc-head .title strong { display: block; font-size: 14.5px; font-weight: 600; }
    .dwc-head .title .status {
      display: flex; align-items: center; gap: 5px;
      font-size: 11px; opacity: .8; margin-top: 2px;
    }
    .dwc-head .title .status::before {
      content: ''; width: 6px; height: 6px; border-radius: 50%;
      background: #34D399;
    }
    .dwc-head .actions { display: flex; gap: 2px; }
    .dwc-head button {
      background: rgba(255,255,255,.12); border: none; cursor: pointer;
      width: 30px; height: 30px; border-radius: 8px; color: #fff;
      font-size: 18px; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      transition: background .2s;
    }
    .dwc-head button:hover { background: rgba(255,255,255,.22); }

    /* Optional banner (human handoff, error, etc.) */
    .dwc-banner {
      display: none; padding: 9px 14px;
      background: #FEF3C7; color: #92400E;
      font-size: 12.5px; font-weight: 500;
      border-bottom: 1px solid rgba(0,0,0,.05);
    }
    .dwc-banner.show { display: block; }
    .dwc-banner.handoff { background: #DBEAFE; color: #1E3A8A; }

    /* Messages */
    .dwc-msgs {
      flex: 1; overflow-y: auto;
      padding: 16px 14px;
      background: #F8FAFC;
      display: flex; flex-direction: column; gap: 8px;
    }
    .dwc-msgs::-webkit-scrollbar { width: 6px; }
    .dwc-msgs::-webkit-scrollbar-thumb {
      background: rgba(15,23,42,.16); border-radius: 6px;
    }

    .dwc-msg { display: flex; max-width: 85%; }
    .dwc-msg.bot { align-self: flex-start; }
    .dwc-msg.user { align-self: flex-end; }
    .dwc-msg .bubble {
      padding: 10px 14px; border-radius: 16px;
      font-size: 13.5px; line-height: 1.5;
      box-shadow: 0 1px 3px rgba(15,23,42,.05);
    }
    .dwc-msg.bot .bubble {
      background: #FFFFFF; color: #0A1430;
      border: 1px solid rgba(15,23,42,.05);
      border-bottom-left-radius: 6px;
    }
    .dwc-msg.user .bubble {
      background: ${cfg.primaryColor}; color: #fff;
      border-bottom-right-radius: 6px;
    }
    .dwc-msg.system .bubble {
      background: rgba(15,23,42,.05); color: #475569;
      font-size: 12px; font-style: italic;
      align-self: center;
    }
    .dwc-msg.system { align-self: center; }
    .dwc-msg .bubble a { color: ${cfg.accentColor}; text-decoration: underline; }

    /* Attachments inside a message */
    .dwc-attach {
      margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap;
    }
    .dwc-attach img {
      max-width: 200px; max-height: 160px;
      border-radius: 10px; cursor: pointer;
    }
    .dwc-attach .file {
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(255,255,255,.15); color: inherit;
      padding: 6px 10px; border-radius: 8px;
      font-size: 12px; text-decoration: none;
    }

    /* Typing indicator */
    .dwc-typing { display: flex; gap: 4px; padding: 12px 16px; align-self: flex-start; }
    .dwc-typing span {
      width: 6px; height: 6px; border-radius: 50%;
      background: ${cfg.accentColor}; opacity: .35;
      animation: dwc-bounce 1.2s ease-in-out infinite;
    }
    .dwc-typing span:nth-child(2) { animation-delay: .15s; }
    .dwc-typing span:nth-child(3) { animation-delay: .30s; }
    @keyframes dwc-bounce {
      0%,80%,100% { transform: translateY(0); opacity: .35; }
      40%         { transform: translateY(-4px); opacity: 1; }
    }

    /* Quick replies */
    .dwc-quick {
      display: flex; gap: 6px; flex-wrap: wrap;
      padding: 4px 14px 0; align-self: flex-start;
    }
    .dwc-quick button {
      background: #fff; border: 1px solid rgba(15,23,42,.1);
      color: ${cfg.accentColor};
      font-size: 12.5px; font-weight: 500;
      padding: 7px 13px; border-radius: 100px; cursor: pointer;
      transition: background .15s, border-color .15s;
    }
    .dwc-quick button:hover {
      background: ${cfg.accentColor}; color: #fff;
      border-color: ${cfg.accentColor};
    }

    /* Booking card */
    .dwc-book-card {
      background: #fff; border: 1px solid rgba(15,23,42,.08);
      border-radius: 16px; padding: 14px; margin-top: 4px;
      width: 100%; max-width: 280px;
    }
    .dwc-book-card h4 {
      font-size: 13px; font-weight: 600; margin-bottom: 10px;
      color: #0A1430;
    }
    .dwc-slots {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
    }
    .dwc-slots button {
      background: #F1F5F9; border: 1px solid transparent;
      color: #0A1430; font-size: 12px; font-weight: 500;
      padding: 8px 6px; border-radius: 8px; cursor: pointer;
      transition: background .15s, border-color .15s;
    }
    .dwc-slots button:hover {
      background: #fff; border-color: ${cfg.accentColor};
      color: ${cfg.accentColor};
    }

    /* Lead form card */
    .dwc-lead-card {
      background: #fff; border: 1px solid rgba(15,23,42,.08);
      border-radius: 16px; padding: 14px; margin-top: 4px;
      width: 100%; max-width: 280px;
      display: flex; flex-direction: column; gap: 8px;
    }
    .dwc-lead-card h4 {
      font-size: 13px; font-weight: 600; color: #0A1430;
    }
    .dwc-lead-card input {
      border: 1px solid rgba(15,23,42,.12); border-radius: 8px;
      padding: 8px 12px; font-size: 12.5px; font-family: inherit;
      outline: none;
    }
    .dwc-lead-card input:focus { border-color: ${cfg.accentColor}; }
    .dwc-lead-card button {
      background: ${cfg.primaryColor}; color: #fff; border: none;
      padding: 9px; border-radius: 8px; font-size: 12.5px; font-weight: 500;
      cursor: pointer;
    }
    .dwc-lead-card button:hover { background: ${cfg.accentColor}; }

    /* Composer */
    .dwc-composer {
      border-top: 1px solid rgba(15,23,42,.06);
      padding: 10px 12px;
      background: #fff;
      display: flex; align-items: center; gap: 6px;
    }
    .dwc-composer input {
      flex: 1; border: 1px solid rgba(15,23,42,.10);
      border-radius: 100px; padding: 9px 14px;
      font-size: 13.5px; font-family: inherit; color: #0A1430;
      outline: none; background: #F8FAFC;
    }
    .dwc-composer input:focus {
      background: #fff; border-color: ${cfg.accentColor};
      box-shadow: 0 0 0 3px ${cfg.accentColor}1a;
    }
    .dwc-composer button {
      background: none; border: none; cursor: pointer;
      width: 36px; height: 36px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      color: ${cfg.accentColor};
      transition: background .15s, color .15s;
    }
    .dwc-composer button:hover { background: rgba(15,23,42,.06); }
    .dwc-composer button.send {
      background: ${cfg.primaryColor}; color: #fff;
    }
    .dwc-composer button.send:hover { background: ${cfg.accentColor}; }
    .dwc-composer button svg { width: 18px; height: 18px; fill: currentColor; }

    /* Toolbar */
    .dwc-toolbar {
      display: flex; align-items: center; gap: 4px;
      padding: 4px 10px 8px;
      background: #fff;
      border-top: 1px solid rgba(15,23,42,.04);
      font-size: 11px; color: #94A3B8;
    }
    .dwc-toolbar select {
      background: none; border: none; font-size: 11px;
      color: ${cfg.accentColor}; cursor: pointer; font-family: inherit;
      padding: 2px 4px; border-radius: 4px;
    }
    .dwc-toolbar .branding {
      margin-left: auto;
      font-size: 10.5px; color: #94A3B8; opacity: .8;
    }
    .dwc-toolbar .branding a { color: inherit; text-decoration: none; }

    @media (max-width: 600px) {
      .dwc-panel {
        ${cfg.position}: 0 !important; bottom: 0; left: 0; top: 0;
        width: 100%; height: 100%; border-radius: 0;
      }
      .dwc-fab { ${cfg.position}: 16px; bottom: 16px; width: 56px; height: 56px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .dwc-typing span { animation: none; opacity: .55; }
    }
  `;

  // ---------- Render skeleton ----------
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const fab = document.createElement('button');
  fab.className = 'dwc-fab';
  fab.setAttribute('aria-label', 'Open chat with ' + cfg.businessName);
  fab.innerHTML =
    '<svg viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2zm3 6v2h2v-2H7zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2z"/></svg>' +
    '<span class="dwc-unread">0</span>';

  const panel = document.createElement('div');
  panel.className = 'dwc-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.innerHTML = `
    <div class="dwc-head">
      <div class="logo">${cfg.logoUrl ? `<img src="${cfg.logoUrl}" alt=""/>` : (cfg.businessName[0] || 'D')}</div>
      <div class="title">
        <strong>${escapeHtml(cfg.businessName)}</strong>
        <span class="status">Online — typically replies in seconds</span>
      </div>
      <div class="actions">
        <button data-dwc-min title="Minimise" aria-label="Minimise">–</button>
      </div>
    </div>
    <div class="dwc-banner" data-dwc-banner></div>
    <div class="dwc-msgs" data-dwc-msgs></div>
    <div class="dwc-composer">
      <button data-dwc-attach title="Attach file" aria-label="Attach">
        <svg viewBox="0 0 24 24"><path d="M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v12.5a1 1 0 0 1-2 0V6h-1.5v11.5a2.5 2.5 0 0 0 5 0V5a4 4 0 0 0-8 0v12.5a5.5 5.5 0 0 0 11 0V6h-1.5z"/></svg>
      </button>
      <input type="text" placeholder="Type a message…" data-dwc-input/>
      <button class="send" data-dwc-send title="Send" aria-label="Send">
        <svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
      </button>
    </div>
    <div class="dwc-toolbar">
      <span>Language:</span>
      <select data-dwc-lang>
        ${state.languages.map(l => `<option value="${l.code}" ${l.code===state.activeLocale?'selected':''}>${l.label}</option>`).join('')}
      </select>
      <span class="branding">Powered by <a href="https://dunper.com" target="_blank" rel="noopener">Dunper AI</a></span>
    </div>
    <input type="file" data-dwc-file hidden accept="image/*,application/pdf"/>
  `;
  document.body.appendChild(fab);
  document.body.appendChild(panel);

  const msgsEl   = panel.querySelector('[data-dwc-msgs]');
  const inputEl  = panel.querySelector('[data-dwc-input]');
  const sendBtn  = panel.querySelector('[data-dwc-send]');
  const attachBtn= panel.querySelector('[data-dwc-attach]');
  const fileEl   = panel.querySelector('[data-dwc-file]');
  const langSel  = panel.querySelector('[data-dwc-lang]');
  const bannerEl = panel.querySelector('[data-dwc-banner]');
  const unread   = fab.querySelector('.dwc-unread');

  // ---------- Util ----------
  function escapeHtml(s){return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function el(tag, cls, html){ const e=document.createElement(tag); if(cls) e.className=cls; if(html!=null) e.innerHTML=html; return e; }
  function scrollDown(){ msgsEl.scrollTop = msgsEl.scrollHeight; }
  function setBanner(text, kind){
    if(!text){ bannerEl.classList.remove('show'); return; }
    bannerEl.className = 'dwc-banner show ' + (kind||'');
    bannerEl.textContent = text;
  }
  function bumpUnread(){
    if(state.open) return;
    const n = parseInt(unread.textContent||'0', 10) + 1;
    unread.textContent = n; unread.classList.add('show');
  }
  function clearUnread(){ unread.classList.remove('show'); unread.textContent='0'; }

  // ---------- Message renderers ----------
  function renderMessage(m){
    const wrap = el('div', 'dwc-msg ' + (m.role||'bot'));
    const bub  = el('div', 'bubble');
    bub.innerHTML = m.html || escapeHtml(m.text || '');
    wrap.appendChild(bub);
    if(m.attachments && m.attachments.length){
      const att = el('div', 'dwc-attach');
      m.attachments.forEach(a => {
        if(a.type && a.type.startsWith('image/')){
          const img = el('img'); img.src = a.url; img.alt = a.name || '';
          att.appendChild(img);
        } else {
          const link = el('a', 'file'); link.href = a.url; link.target='_blank';
          link.textContent = '📎 ' + (a.name || 'file');
          att.appendChild(link);
        }
      });
      bub.appendChild(att);
    }
    msgsEl.appendChild(wrap);
    return wrap;
  }
  function renderQuickReplies(replies){
    if(!replies || !replies.length) return;
    const row = el('div', 'dwc-quick');
    replies.forEach(text => {
      const b = el('button', null, escapeHtml(text));
      b.addEventListener('click', () => { row.remove(); userSend(text); });
      row.appendChild(b);
    });
    msgsEl.appendChild(row);
    scrollDown();
  }
  function renderBookingCard(slots){
    const card = el('div', 'dwc-msg bot');
    const inner = el('div', 'dwc-book-card');
    inner.innerHTML = '<h4>Pick a time that works for you</h4><div class="dwc-slots"></div>';
    const slotEl = inner.querySelector('.dwc-slots');
    slots.forEach(s => {
      const b = el('button', null, s.label);
      b.addEventListener('click', () => confirmBooking(s));
      slotEl.appendChild(b);
    });
    card.appendChild(inner);
    msgsEl.appendChild(card);
    scrollDown();
  }
  function renderLeadForm(){
    if (state.profile && state.profile.email) return; // already qualified
    const card = el('div', 'dwc-msg bot');
    const inner = el('div', 'dwc-lead-card');
    inner.innerHTML = `
      <h4>Quick — who am I talking to?</h4>
      <input type="text"  placeholder="Your name"  data-f="name"/>
      <input type="email" placeholder="Email"      data-f="email"/>
      <input type="tel"   placeholder="Phone (optional)" data-f="phone"/>
      <button>Save & continue</button>
    `;
    inner.querySelector('button').addEventListener('click', () => {
      const profile = {
        name:  inner.querySelector('[data-f=name]').value.trim(),
        email: inner.querySelector('[data-f=email]').value.trim(),
        phone: inner.querySelector('[data-f=phone]').value.trim(),
      };
      if (!profile.email) return;
      state.profile = Object.assign({ id: 'cust_'+Math.random().toString(36).slice(2,9) }, profile);
      persist();
      card.remove();
      addBotMessage(`Thanks, ${profile.name || 'friend'} 👋 — got it.`);
    });
    card.appendChild(inner);
    msgsEl.appendChild(card);
    scrollDown();
  }
  function showTyping(){
    const t = el('div', 'dwc-typing'); t.dataset.dwcTyping = '1';
    t.innerHTML = '<span></span><span></span><span></span>';
    msgsEl.appendChild(t); scrollDown(); return t;
  }
  function hideTyping(node){ if(node && node.parentNode) node.remove(); }

  function addBotMessage(text, opts){
    const m = { role:'bot', text, html: opts && opts.html, attachments: opts && opts.attachments };
    state.messages.push(m); persist();
    renderMessage(m); scrollDown();
    if(opts && opts.quickReplies) renderQuickReplies(opts.quickReplies);
    if(opts && opts.action === 'booking') renderBookingCard(opts.slots || mockSlots());
    if(opts && opts.action === 'lead')    renderLeadForm();
    if(opts && opts.action === 'handoff') setBanner('A teammate is taking over from here.', 'handoff');
    bumpUnread();
  }
  function addUserMessage(text, attachments){
    const m = { role:'user', text, attachments };
    state.messages.push(m); persist();
    renderMessage(m); scrollDown();
  }
  function addSystemMessage(text){
    const m = { role:'system', text };
    renderMessage(m); scrollDown();
  }

  // ---------- Backend hooks (mocked) ----------
  // BACKEND HOOK 1: POST /v1/messages
  async function apiSend(text, attachments){
    // Real call:
    //   return fetch(cfg.apiBase + '/v1/messages', {
    //     method:'POST',
    //     headers:{ 'Content-Type':'application/json', 'X-Tenant':cfg.tenantId },
    //     body: JSON.stringify({ sessionId: state.sessionId, profileId: state.profile?.id, text, attachments, locale: state.activeLocale })
    //   }).then(r => r.json());
    return mockReply(text);
  }
  // BACKEND HOOK 2: GET /v1/availability?serviceId=&date=
  async function apiAvailability(){ return mockSlots(); }
  // BACKEND HOOK 3: POST /v1/bookings
  async function apiBook(slot){
    return { ok:true, confirmation:'CONF-' + Math.random().toString(36).slice(2,7).toUpperCase(), slot };
  }
  // BACKEND HOOK 4: POST /v1/attachments  (multipart/form-data)
  async function apiUpload(file){
    return { url: URL.createObjectURL(file), name:file.name, type:file.type };
  }

  // ---------- Mock conversation flow (so demo works without backend) ----------
  function mockSlots(){
    const today = new Date();
    const base = today.getHours() < 12 ? 14 : 10;
    return [
      { id:'s1', label: `Today ${base}:00`,    iso: new Date(today.setHours(base,0,0,0)).toISOString() },
      { id:'s2', label: `Today ${base+1}:30`,  iso: new Date(today.setHours(base+1,30,0,0)).toISOString() },
      { id:'s3', label: `Tmr  10:00`,          iso: new Date(Date.now()+86400000).toISOString() },
      { id:'s4', label: `Tmr  13:30`,          iso: new Date(Date.now()+86400000).toISOString() },
      { id:'s5', label: `Fri  09:00`,          iso: new Date(Date.now()+3*86400000).toISOString() },
      { id:'s6', label: `Fri  16:00`,          iso: new Date(Date.now()+3*86400000).toISOString() },
    ];
  }
  function mockReply(text){
    const t = text.toLowerCase();
    if (/book|appointment|schedule|reserve/.test(t))
      return { text:"Of course — here are the next available times:", action:'booking', slots: mockSlots() };
    if (/price|cost|how much|fee/.test(t))
      return { text:"Pricing depends on what you need. Want me to send our rate card to your email?", quickReplies:['Yes please', 'Just tell me here'] };
    if (/hour|open|when/.test(t))
      return { text:"We're open Mon–Fri 9am–6pm and Saturday 10am–2pm. Want me to book you in?" , quickReplies:['Book now', 'No thanks'] };
    if (/contact|human|person|agent|talk to someone/.test(t))
      return { text:"Connecting you with a teammate now — they'll take it from here.", action:'handoff' };
    if (!state.profile)
      return { text:"Happy to help! Quick question before we go further —", action:'lead' };
    return { text:"Got it. " + (state.profile && state.profile.name ? state.profile.name + ', ' : '') + "anything else I can help with?", quickReplies:['Book an appointment','Pricing','Talk to a human'] };
  }

  // ---------- Wire up ----------
  async function userSend(text){
    text = (text||'').trim();
    if(!text) return;
    addUserMessage(text);
    inputEl.value = '';
    const typing = showTyping();
    state.sending = true;
    try {
      const reply = await apiSend(text, []);
      hideTyping(typing);
      addBotMessage(reply.text, reply);
    } catch (e) {
      hideTyping(typing);
      setBanner("Couldn't reach Dunper. We'll retry in a moment.", 'error');
    } finally {
      state.sending = false;
    }
  }
  async function confirmBooking(slot){
    addUserMessage(`I'll take ${slot.label}.`);
    const typing = showTyping();
    const r = await apiBook(slot);
    hideTyping(typing);
    if(r.ok){
      addBotMessage(`Booked ✅ — confirmation <strong>${r.confirmation}</strong>. We'll email a reminder.`, { html:true });
    } else {
      addBotMessage("That slot just got taken — can we try another?");
    }
  }

  sendBtn.addEventListener('click', () => userSend(inputEl.value));
  inputEl.addEventListener('keydown', e => { if(e.key === 'Enter') userSend(inputEl.value); });
  attachBtn.addEventListener('click', () => fileEl.click());
  fileEl.addEventListener('change', async () => {
    const f = fileEl.files && fileEl.files[0]; if(!f) return;
    const att = await apiUpload(f);
    addUserMessage('', [att]);
    fileEl.value = '';
    const typing = showTyping();
    setTimeout(() => { hideTyping(typing); addBotMessage("Got the file, thanks. Let me take a look."); }, 700);
  });
  langSel.addEventListener('change', () => {
    state.activeLocale = langSel.value; persist();
    addSystemMessage('Language switched to ' + (state.languages.find(l=>l.code===state.activeLocale)||{}).label);
  });
  fab.addEventListener('click', open);
  panel.querySelector('[data-dwc-min]').addEventListener('click', close);

  function open(){
    state.open = true;
    panel.classList.add('open');
    clearUnread();
    inputEl.focus();
  }
  function close(){
    state.open = false;
    panel.classList.remove('open');
  }

  // ---------- Initial render ----------
  // Replay history if any, else greet
  if(state.messages.length){
    state.messages.forEach(renderMessage);
  } else {
    addBotMessage(cfg.greeting, { quickReplies: ['Book an appointment','Pricing','Talk to a human'] });
  }
  scrollDown();

  // Public API
  window.openDunperChat   = open;
  window.closeDunperChat  = close;
  window.dunperChat = { open, close, addBotMessage, state, cfg };
})();
