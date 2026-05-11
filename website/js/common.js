/* Dunper marketing site — shared JS
 *
 * Provides:
 *   - Nav chatbar: typing + send navigates to the chat landing page.
 *   - Scroll-triggered fade-in animations on cards and sections.
 *   - A site-wide "Pinterest-style" visual refresh injected as a single
 *     stylesheet: lavender-blue body, white cards with soft shadows, dark
 *     navy pill buttons, geometric sans typography, chip section labels.
 */

(function () {
  // ===== Nav chatbar (form or div) =====
  function navigateToChat(q) {
    const dest = 'dunper_chat.html' + (q ? '?q=' + encodeURIComponent(q) : '');
    window.location.href = dest;
  }

  function wireChatbar() {
    const bar = document.querySelector('.nav-chatbar');
    if (!bar) return;
    const input = bar.querySelector('input');
    if (!input) return;
    const button = bar.querySelector('.chatbar-send');

    function fire(e) {
      if (e) e.preventDefault();
      navigateToChat((input.value || '').trim());
    }

    if (bar.tagName === 'FORM') {
      bar.addEventListener('submit', fire);
    } else {
      if (button) button.addEventListener('click', fire);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') fire(e);
      });
    }
  }

  // ===== Injected stylesheet (Pinterest-style refresh + animations) =====
  const animCss = `
    /* ===========================================================
       PINTEREST-STYLE REFRESH
       Minimal lavender-blue body, white cards, dark navy pill
       buttons, geometric sans throughout, chip-style labels.
       =========================================================== */

    body {
      background:
        radial-gradient(ellipse 80% 60% at 15% -5%, rgba(206,219,242,.55) 0%, transparent 60%),
        radial-gradient(ellipse 70% 50% at 85% 105%, rgba(192,207,234,.45) 0%, transparent 60%),
        #EBF0FA !important;
      color: #0A1430 !important;
      font-family: 'Outfit', 'DM Sans', system-ui, -apple-system, sans-serif !important;
    }

    /* Headings — sans-serif, bold, dark navy */
    h1, h2, h3, h4, h5, h6,
    .hero-title, .page-title, .section-title,
    .chat-title, .compare-title, .card-title,
    .ty-title {
      font-family: 'Outfit', sans-serif !important;
      font-weight: 700 !important;
      color: #0A1430 !important;
      font-style: normal !important;
      letter-spacing: -0.02em !important;
    }

    /* Italic emphasis becomes coloured-bold instead of italic-serif */
    h1 em, h2 em, h3 em,
    .hero-title em, .section-title em, .chat-title em,
    .page-title em, .card-title em,
    h1 .line-two {
      font-style: normal !important;
      color: #1E3A8A !important;
      background: none !important;
      -webkit-background-clip: padding-box !important;
      background-clip: padding-box !important;
      -webkit-text-fill-color: #1E3A8A !important;
      font-weight: 700 !important;
    }

    /* Secondary body text — slate grey */
    .hero-sub, .page-sub, .chat-sub, .card-sub,
    .section-body, .section-body p,
    .demo-text p, .cta-box p, .chatbot-text p,
    .terms-note, .info-card p, .step p, .feature-card p,
    .team-card p, .split-card p, .compare-subtitle,
    .toggle-label, .team-bio, .fact-label,
    .ty-step-text, .ty-sub {
      color: #475569 !important;
      font-weight: 400 !important;
      -webkit-text-fill-color: #475569 !important;
      background: none !important;
      -webkit-background-clip: padding-box !important;
      background-clip: padding-box !important;
    }

    /* === Cards: pure white with soft drop shadow === */
    .feature-card, .info-card, .value-card, .step,
    .team-card, .split-card, .plan-card, .auth-card,
    .invoice-box, .terms-box, .mission-section,
    .demo-visual, .chatbot-section, .compare-section,
    .chat-window {
      background: #FFFFFF !important;
      border: 1px solid rgba(15,23,42,0.05) !important;
      box-shadow: 0 10px 32px rgba(15,23,42,0.06) !important;
      border-radius: 22px !important;
    }
    .feature-card:hover, .info-card:hover, .value-card:hover,
    .team-card:hover, .split-card:hover, .step:hover,
    .plan-card:hover {
      transform: translateY(-6px) !important;
      border-color: rgba(15,23,42,0.10) !important;
      box-shadow: 0 22px 52px rgba(15,23,42,0.09) !important;
    }

    /* Featured plan card gets a subtle blue tint to stand out */
    .plan-card.featured {
      background: linear-gradient(180deg, #EEF3FF 0%, #FFFFFF 100%) !important;
      border-color: rgba(30,58,138,0.18) !important;
    }

    /* === Buttons: dark navy pills === */
    .btn-primary, .nav-cta, .submit-btn, .plan-btn,
    .modal-actions button, .chatbar-send, .composer button,
    .featured-btn {
      background: #0A1430 !important;
      color: #FFFFFF !important;
      border: none !important;
      box-shadow: 0 6px 18px rgba(10,20,48,0.18) !important;
      transition: background .2s ease, transform .2s ease, box-shadow .2s ease !important;
    }
    .btn-primary:hover, .nav-cta:hover, .submit-btn:hover,
    .plan-btn:hover, .modal-actions button:hover,
    .chatbar-send:hover, .composer button:hover {
      background: #1E3A8A !important;
      transform: translateY(-1px) !important;
      box-shadow: 0 10px 24px rgba(10,20,48,0.24) !important;
    }
    .chatbar-send svg, .composer button svg {
      fill: #FFFFFF !important;
    }

    /* Outline button */
    .btn-outline {
      background: transparent !important;
      border: 1.5px solid rgba(15,23,42,0.15) !important;
      color: #0A1430 !important;
      box-shadow: none !important;
    }
    .btn-outline:hover {
      background: rgba(15,23,42,0.04) !important;
      border-color: rgba(15,23,42,0.3) !important;
      color: #0A1430 !important;
    }

    /* === Nav === */
    nav {
      background: rgba(235,240,250,0.82) !important;
      backdrop-filter: blur(14px) saturate(140%) !important;
      border-bottom: 1px solid rgba(15,23,42,0.06) !important;
    }
    .logo-text {
      color: #0A1430 !important;
      font-family: 'Outfit', sans-serif !important;
    }
    .nav-links a {
      color: #475569 !important;
      text-transform: none !important;
      letter-spacing: 0 !important;
      font-weight: 500 !important;
      font-size: 13.5px !important;
    }
    .nav-links a:hover { color: #0A1430 !important; }
    .nav-links a.active { color: #1E3A8A !important; }
    .nav-links a::after { background: #1E3A8A !important; }

    /* Nav chatbar */
    .nav-chatbar {
      background: #FFFFFF !important;
      border: 1px solid rgba(15,23,42,0.08) !important;
      box-shadow: 0 2px 10px rgba(15,23,42,0.04) !important;
    }
    .nav-chatbar input {
      color: #0A1430 !important;
      font-family: 'Outfit', sans-serif !important;
    }
    .nav-chatbar input::placeholder {
      color: #94A3B8 !important;
      opacity: 1 !important;
    }
    .nav-chatbar:focus-within {
      border-color: rgba(30,58,138,0.4) !important;
      box-shadow: 0 0 0 3px rgba(30,58,138,0.08) !important;
    }

    /* === Chip-style section labels (the "● Business Impact" pattern) === */
    .section-label, .page-label, .chat-label, .hero-label,
    .section-tag, .plan-badge, .save-badge, .hero-badge {
      display: inline-flex !important;
      align-items: center !important;
      gap: 7px !important;
      background: #FFFFFF !important;
      border: 1px solid rgba(15,23,42,0.08) !important;
      color: #0A1430 !important;
      -webkit-text-fill-color: #0A1430 !important;
      padding: 6px 14px !important;
      border-radius: 50px !important;
      font-size: 11.5px !important;
      font-weight: 500 !important;
      letter-spacing: 0 !important;
      text-transform: none !important;
      background-image: none !important;
      -webkit-background-clip: padding-box !important;
      background-clip: padding-box !important;
      box-shadow: 0 2px 8px rgba(15,23,42,0.04) !important;
      font-family: 'Outfit', sans-serif !important;
      line-height: 1.4 !important;
    }
    .section-label::before, .page-label::before, .chat-label::before,
    .hero-label::before, .section-tag::before, .plan-badge::before,
    .save-badge::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #3B82F6;
      flex-shrink: 0;
      display: inline-block;
    }
    .plan-badge::before { background: #34D399 !important; }
    .save-badge::before { background: #FB923C !important; }

    /* === Inputs === */
    input:not([type=checkbox]):not([type=radio]),
    textarea, select {
      background: #FFFFFF !important;
      border: 1px solid rgba(15,23,42,0.10) !important;
      color: #0A1430 !important;
      border-radius: 12px !important;
      font-family: 'Outfit', sans-serif !important;
    }
    input:not([type=checkbox]):not([type=radio]):focus,
    textarea:focus, select:focus {
      border-color: rgba(15,23,42,0.4) !important;
      box-shadow: 0 0 0 3px rgba(15,23,42,0.06) !important;
      outline: none !important;
    }
    input::placeholder, textarea::placeholder {
      color: #94A3B8 !important;
      opacity: 1 !important;
    }

    /* === Hero: white card sitting on the lavender body === */
    section.hero {
      background: #FFFFFF !important;
      color: #0A1430 !important;
      border-radius: 32px !important;
      margin: 88px 24px 60px !important;
      padding: 80px 40px 80px !important;
      position: relative !important;
      overflow: hidden !important;
      min-height: auto !important;
      box-shadow: 0 20px 60px rgba(15,23,42,0.06) !important;
      isolation: isolate !important;
    }
    section.hero::after { display: none !important; }
    section.hero h1, section.hero .hero-title {
      color: #0A1430 !important;
      -webkit-text-fill-color: #0A1430 !important;
    }
    section.hero p, section.hero .hero-sub {
      color: #475569 !important;
      -webkit-text-fill-color: #475569 !important;
    }
    section.hero h1 em,
    section.hero .hero-title em,
    section.hero h1 .line-two {
      color: #1E3A8A !important;
      -webkit-text-fill-color: #1E3A8A !important;
      background: none !important;
      -webkit-background-clip: padding-box !important;
      background-clip: padding-box !important;
    }
    section.hero .btn-outline {
      color: #0A1430 !important;
      border-color: rgba(15,23,42,0.15) !important;
    }
    section.hero .scroll-cue { color: #475569 !important; }
    /* tone down decorative orbs so they're a faint blue glow */
    section.hero .hero-orb { opacity: 0.35 !important; filter: blur(80px) !important; }
    section.hero .hero-grid { opacity: 0.25 !important; }

    /* Override the old dark-hero nav rule — keep nav light over light hero */
    body:has(section.hero) nav {
      background: rgba(235,240,250,0.82) !important;
      backdrop-filter: blur(14px) saturate(140%) !important;
      border-bottom-color: rgba(15,23,42,0.06) !important;
    }
    body:has(section.hero) nav .logo-text { color: #0A1430 !important; }
    body:has(section.hero) nav .nav-links a { color: #475569 !important; }
    body:has(section.hero) nav .nav-links a:hover { color: #0A1430 !important; }
    body:has(section.hero) nav .nav-links a.active { color: #1E3A8A !important; }
    body:has(section.hero) nav .nav-chatbar {
      background: #FFFFFF !important;
      border-color: rgba(15,23,42,0.08) !important;
    }
    body:has(section.hero) nav .nav-chatbar input { color: #0A1430 !important; }
    body:has(section.hero) nav .nav-chatbar input::placeholder { color: #94A3B8 !important; }

    /* === Disable animated bg orbs (Pinterest is minimal) === */
    body.animated-bg::before,
    body.animated-bg::after,
    body.animated-bg > .ambient-orb {
      display: none !important;
    }
    body.animated-bg {
      isolation: auto !important;
    }

    /* === Icon chips inside cards: soft grey-blue tile with emoji === */
    .feature-icon, .split-icon, .value-icon, .info-icon,
    .step-icon {
      background: #F1F5F9 !important;
      color: #0A1430 !important;
      box-shadow: inset 0 0 0 1px rgba(15,23,42,0.04) !important;
    }

    /* === Team avatars: dark navy circle with white initials === */
    .team-photo {
      background: #0A1430 !important;
      color: #FFFFFF !important;
      border: none !important;
    }
    .team-avatar {
      background: #0A1430 !important;
      color: #FFFFFF !important;
    }

    /* === Step / progress dots === */
    .step-dot {
      background: #FFFFFF !important;
      border: 2px solid rgba(15,23,42,0.15) !important;
      color: #94A3B8 !important;
    }
    .step-dot.done, .step-dot.active {
      background: #0A1430 !important;
      color: #FFFFFF !important;
      border-color: #0A1430 !important;
    }
    .step-connector.done { background: #0A1430 !important; }

    /* Step numbers in card lists */
    .step-num, .timeline-date {
      color: #1E3A8A !important;
      font-weight: 600 !important;
    }

    /* === Tabs === */
    .tab-btn { color: #475569 !important; }
    .tab-btn.active {
      color: #0A1430 !important;
      border-bottom-color: #1E3A8A !important;
    }

    /* === Compare table === */
    .compare-table th, .compare-table td {
      color: #0A1430 !important;
      border-color: rgba(15,23,42,0.06) !important;
    }
    .compare-table .tick { color: #34D399 !important; }
    .compare-table .cross { color: #94A3B8 !important; }

    /* === Modal === */
    .modal-card {
      background: #FFFFFF !important;
      color: #0A1430 !important;
    }
    .modal-card h2, .modal-card h2 em {
      color: #0A1430 !important;
      -webkit-text-fill-color: #0A1430 !important;
    }
    .modal-card .terms-box {
      background: #F8FAFC !important;
      color: #0A1430 !important;
      border-color: rgba(15,23,42,0.08) !important;
    }

    /* === Chat bubbles === */
    .msg-bot .msg-bubble {
      background: #F1F5F9 !important;
      color: #0A1430 !important;
      border-color: rgba(15,23,42,0.06) !important;
    }
    .msg-user .msg-bubble {
      background: #0A1430 !important;
      color: #FFFFFF !important;
    }
    .msg-bot .msg-bubble strong { color: #0A1430 !important; }
    .msg-bot .msg-bubble a { color: #1E3A8A !important; }
    .msg-user .msg-avatar {
      background: #0A1430 !important;
      color: #FFFFFF !important;
    }

    /* Chat CTA strip */
    .chat-cta a {
      background: #FFFFFF !important;
      border-color: rgba(15,23,42,0.10) !important;
      color: #475569 !important;
    }
    .chat-cta a:hover {
      border-color: rgba(15,23,42,0.3) !important;
      color: #0A1430 !important;
    }

    /* === Footer === */
    footer {
      background: transparent !important;
      color: #475569 !important;
      border-top: 1px solid rgba(15,23,42,0.06) !important;
    }
    footer .footer-copy, footer .footer-right,
    footer span, footer a {
      color: #475569 !important;
      -webkit-text-fill-color: #475569 !important;
      background: none !important;
      -webkit-background-clip: padding-box !important;
      background-clip: padding-box !important;
    }
    footer .logo-text { color: #0A1430 !important; }

    /* === Disable the playful shimmer on buttons (too busy for this aesthetic) === */
    .nav-cta::after, .submit-btn::after, .btn-primary::after,
    .plan-btn.featured-btn::after, .composer button::after,
    .chatbar-send::after, .modal-actions button::after {
      display: none !important;
    }

    /* === Scroll fade entrance animation (kept) === */
    .scroll-anim-ready :is(
      .section, .feature-card, .step, .team-card, .split-card,
      .plan-card, .info-card, .value-card, .auth-card, .compare-section,
      .invoice-box, .terms-box, .mission-section, .timeline-item,
      .chat-window, .composer
    ) {
      opacity: 0;
      transform: translateY(22px);
      transition: opacity .65s cubic-bezier(.16,1,.3,1),
                  transform .65s cubic-bezier(.16,1,.3,1);
      will-change: opacity, transform;
    }
    .scroll-anim-ready .scroll-in {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }
    .scroll-anim-ready :is(.feature-grid, .step-list, .team-grid, .plans-grid, .values-grid) > *:nth-child(2) { transition-delay: .08s; }
    .scroll-anim-ready :is(.feature-grid, .step-list, .team-grid, .plans-grid, .values-grid) > *:nth-child(3) { transition-delay: .16s; }
    .scroll-anim-ready :is(.feature-grid, .step-list, .team-grid, .plans-grid, .values-grid) > *:nth-child(4) { transition-delay: .24s; }
    .scroll-anim-ready :is(.team-grid, .plans-grid) > *:nth-child(5) { transition-delay: .32s; }

    /* Card hover transitions inherit from override above; nothing else to add. */

    /* Animated nav underline (kept) */
    .nav-links a { position: relative; }
    .nav-links a::after {
      content: '';
      position: absolute;
      left: 0; bottom: -5px;
      width: 100%; height: 2px;
      background: #1E3A8A;
      transform: scaleX(0);
      transform-origin: right center;
      transition: transform .35s cubic-bezier(.16,1,.3,1);
      pointer-events: none;
      border-radius: 2px;
    }
    .nav-links a:hover::after,
    .nav-links a.active::after {
      transform: scaleX(1);
      transform-origin: left center;
    }

    /* Logo wiggle on hover */
    .nav-logo .logo-img { transition: transform .4s cubic-bezier(.16,1,.3,1); }
    .nav-logo:hover .logo-img { transform: rotate(-6deg) scale(1.06); }

    /* Reduced-motion */
    @media (prefers-reduced-motion: reduce) {
      .scroll-anim-ready :is(.section, .feature-card, .step, .team-card,
        .split-card, .plan-card, .info-card, .value-card, .auth-card,
        .compare-section, .invoice-box, .terms-box, .mission-section,
        .timeline-item, .chat-window, .composer) {
        opacity: 1 !important;
        transform: none !important;
        transition: none !important;
      }
      .nav-links a::after { transition: none !important; }
      .nav-logo .logo-img { transition: none !important; }
    }

    /* ===========================================================
       Round-specific tweaks
       =========================================================== */

    /* (1) Terms & Privacy Policy body text — darker blue */
    .terms-box, .terms-box p, .terms-box strong,
    .terms-box h4, .modal-card .terms-box,
    .modal-card .terms-box p, .modal-card .terms-box strong,
    .modal-card .modal-sub {
      color: #15326B !important;
      -webkit-text-fill-color: #15326B !important;
    }
    .terms-box h4 { color: #0A1430 !important; -webkit-text-fill-color: #0A1430 !important; }

    /* (3) Services page — colour the 6 feature cards a soft blue so they
       pop against the lavender body */
    body.page-services .feature-card {
      background: linear-gradient(180deg, #DEEAFB 0%, #E9F0FB 100%) !important;
      border-color: rgba(30,58,138,0.14) !important;
      box-shadow: 0 8px 24px rgba(30,58,138,0.08) !important;
    }
    body.page-services .feature-card:hover {
      border-color: rgba(30,58,138,0.28) !important;
      box-shadow: 0 18px 44px rgba(30,58,138,0.12) !important;
      background: linear-gradient(180deg, #D2DFF7 0%, #E1ECFA 100%) !important;
    }
    body.page-services .feature-card h4,
    body.page-services .feature-card h3 {
      color: #0A1430 !important;
    }
    body.page-services .feature-card p {
      color: #1E3A8A !important;
      -webkit-text-fill-color: #1E3A8A !important;
    }
    body.page-services .feature-icon {
      background: #FFFFFF !important;
      color: #1E3A8A !important;
      box-shadow: inset 0 0 0 1px rgba(30,58,138,0.16) !important;
    }

    /* (4) Compare features — cleaner table + tab pills */
    body.page-join .compare-section {
      padding: 28px !important;
    }
    body.page-join .compare-title {
      font-family: 'Outfit', sans-serif !important;
      font-weight: 700 !important;
      color: #0A1430 !important;
      letter-spacing: -0.02em !important;
      font-size: clamp(24px, 3.5vw, 32px) !important;
    }
    body.page-join .compare-tabs {
      gap: 6px !important;
      padding: 4px !important;
      background: #F1F5F9 !important;
      border-radius: 100px !important;
      display: inline-flex !important;
      margin-bottom: 24px !important;
    }
    body.page-join .tab-btn {
      padding: 8px 18px !important;
      border: none !important;
      background: transparent !important;
      color: #475569 !important;
      font-size: 12.5px !important;
      font-weight: 500 !important;
      border-radius: 100px !important;
      transition: background .2s ease, color .2s ease !important;
    }
    body.page-join .tab-btn:hover:not(.active) {
      color: #0A1430 !important;
      background: rgba(15,23,42,0.04) !important;
    }
    body.page-join .tab-btn.active {
      background: #FFFFFF !important;
      color: #0A1430 !important;
      box-shadow: 0 2px 8px rgba(15,23,42,0.08) !important;
      border: none !important;
    }
    body.page-join .compare-table {
      width: 100% !important;
      border-collapse: collapse !important;
    }
    body.page-join .compare-table thead th {
      background: transparent !important;
      -webkit-background-clip: padding-box !important;
      background-clip: padding-box !important;
      -webkit-text-fill-color: #94A3B8 !important;
      color: #94A3B8 !important;
      font-size: 11px !important;
      letter-spacing: .08em !important;
      text-transform: uppercase !important;
      font-weight: 600 !important;
      padding: 16px 20px !important;
      border-bottom: 1px solid rgba(15,23,42,0.08) !important;
      text-align: center !important;
    }
    body.page-join .compare-table tbody td {
      padding: 14px 20px !important;
      border-bottom: 1px solid rgba(15,23,42,0.06) !important;
      color: #0A1430 !important;
      font-size: 13.5px !important;
      text-align: center !important;
    }
    body.page-join .compare-table th:first-child,
    body.page-join .compare-table td:first-child {
      text-align: left !important;
      color: #475569 !important;
      font-weight: 500 !important;
    }
    body.page-join .compare-table tbody tr:nth-child(even) td {
      background: rgba(241,245,249,0.5) !important;
    }
    body.page-join .compare-table tbody tr:hover td {
      background: rgba(30,58,138,0.05) !important;
    }
    body.page-join .compare-table .tick {
      background: none !important;
      -webkit-background-clip: padding-box !important;
      background-clip: padding-box !important;
      -webkit-text-fill-color: #16A34A !important;
      color: #16A34A !important;
      font-size: 15px !important;
    }
    body.page-join .compare-table .cross {
      -webkit-text-fill-color: #CBD5E1 !important;
      color: #CBD5E1 !important;
      font-size: 15px !important;
    }

    /* (5) Nav chatbar — dark blue outline */
    .nav-chatbar {
      border: 1.5px solid #1E3A8A !important;
      box-shadow: 0 2px 10px rgba(30,58,138,0.10) !important;
    }
    .nav-chatbar:focus-within {
      border-color: #0A1430 !important;
      box-shadow: 0 0 0 3px rgba(30,58,138,0.16) !important;
    }
    body:has(section.hero) nav .nav-chatbar {
      border: 1.5px solid #1E3A8A !important;
    }

    /* Responsive hero padding */
    @media (max-width: 720px) {
      section.hero {
        margin: 88px 12px 40px !important;
        padding: 60px 24px 60px !important;
        border-radius: 24px !important;
      }
    }
  `;

  function injectStyles() {
    if (document.getElementById('dunper-anim-styles')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'dunper-anim-styles';
    styleEl.textContent = animCss;
    document.head.appendChild(styleEl);
  }

  function wireScrollAnim() {
    const selector = '.section, .feature-card, .step, .team-card, .split-card, .plan-card, .info-card, .value-card, .auth-card, .compare-section, .invoice-box, .terms-box, .mission-section, .timeline-item, .chat-window, .composer';
    const targets = document.querySelectorAll(selector);
    if (!targets.length) return;
    document.body.classList.add('scroll-anim-ready');
    if (!('IntersectionObserver' in window)) {
      targets.forEach(el => el.classList.add('scroll-in'));
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('scroll-in');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    targets.forEach(el => obs.observe(el));
  }

  function tagPage() {
    // Add a body class per page so CSS can target page-specific tweaks
    const path = (window.location.pathname || '').toLowerCase();
    const m = path.match(/dunper_([a-z]+)\.html/);
    if (m && m[1]) document.body.classList.add('page-' + m[1]);
  }

  function init() {
    tagPage();
    injectStyles();
    wireChatbar();
    wireScrollAnim();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
