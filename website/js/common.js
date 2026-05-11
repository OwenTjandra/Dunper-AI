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
  // ===== Nav chatbar (REMOVED) =====
  // The "Ask our chatbot anything" search box used to redirect to
  // dunper_chat.html (an early-stage Q&A preview). The bar is now
  // CSS-hidden site-wide and this handler is a no-op.
  function wireChatbar() { /* removed */ }

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

    /* Nav chatbar — hidden site-wide (the early-stage preview chatbot
       it linked to has been retired). Kept the markup intact so the
       grid layout doesn't shift, just visually removed. */
    .nav-chatbar { display: none !important; }
    .nav-spacer  { display: none !important; }

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

    /* Hero badge already has its own .badge-dot child — hide it so the
       chip-style ::before doesn't render a second dot. */
    .hero-badge .badge-dot { display: none !important; }

    /* Decorative hero overlays on the home page (orbs + grid + bg) were
       intercepting clicks on the hero-actions buttons below them. Make
       them visible-only. */
    section.hero .hero-orb,
    section.hero .hero-bg,
    section.hero .hero-grid { pointer-events: none !important; }
    /* Lift the hero buttons above any positioned decoration just in case. */
    section.hero .hero-actions,
    section.hero .hero-actions a { z-index: 5 !important; position: relative !important; }

    /* Base layout for .nav-chatbar (used unconditionally — widget pages
       don't ship their own nav-chatbar CSS, so without this they render
       as a vertical stack instead of a search pill). Doesn't use
       !important so existing per-page rules still apply where present. */
    .nav-chatbar {
      display: flex;
      align-items: center;
      border-radius: 50px;
      overflow: hidden;
      flex: 1;
      max-width: 460px;
      transition: border-color .25s ease, box-shadow .25s ease;
    }
    /* Services / Contact / Join Us use a flat nav (no nav-left wrapper
       and no justify-content:space-between), so the chatbar was sitting
       flush against the nav links. Push it right so the visual layout
       matches the home page (chatbar floats near the Sign In CTA). */
    body.page-services nav .nav-chatbar,
    body.page-contact nav .nav-chatbar,
    body.page-join nav .nav-chatbar {
      margin-left: auto !important;
    }
    .nav-chatbar input {
      flex: 1;
      background: none;
      border: none;
      outline: none;
      padding: 9px 16px;
      font-size: 13px;
    }
    .chatbar-send {
      border: none;
      cursor: pointer;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      margin: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: transform .2s ease;
    }
    .chatbar-send svg { width: 13px; height: 13px; }
    .chatbar-send:hover { transform: scale(1.06); }

    /* "For developers" CTA section on the home page */
    body.page-home .dev-cta {
      padding: 60px 40px 100px;
      max-width: 1100px;
      margin: 0 auto;
    }
    body.page-home .dev-cta-inner {
      background: #FFFFFF;
      border: 1px solid rgba(15,23,42,0.06);
      border-radius: 28px;
      padding: 56px 48px;
      box-shadow: 0 14px 40px rgba(15,23,42,0.06);
      position: relative;
      overflow: hidden;
      background-image:
        radial-gradient(ellipse 60% 50% at 100% 0%, rgba(30,58,138,.07) 0%, transparent 60%),
        radial-gradient(ellipse 50% 60% at 0% 100%, rgba(46,120,212,.06) 0%, transparent 60%);
    }
    body.page-home .dev-cta-inner h2 {
      font-family: 'Outfit', sans-serif !important;
      font-weight: 700;
      font-size: clamp(28px, 4vw, 40px);
      letter-spacing: -0.02em;
      color: #0A1430;
      margin: 12px 0 14px;
      line-height: 1.15;
    }
    body.page-home .dev-cta-inner h2 em {
      font-style: normal;
      color: #1E3A8A;
    }
    body.page-home .dev-cta-inner p {
      color: #475569;
      font-size: 16px;
      line-height: 1.7;
      max-width: 560px;
      margin-bottom: 24px;
    }
    body.page-home .dev-cta-buttons {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    body.page-home .dev-cta-buttons .btn-primary,
    body.page-home .dev-cta-buttons .btn-outline {
      padding: 12px 24px;
      border-radius: 50px;
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      transition: background .2s ease, transform .2s ease;
    }
    @media (max-width: 720px) {
      body.page-home .dev-cta-inner { padding: 36px 24px; }
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

    /* ===========================================================
       MOBILE HAMBURGER NAV
       Hides desktop nav links/chatbar on phones and shows a
       three-bar button that toggles a dropdown panel below the nav.
       =========================================================== */
    .nav-hamburger {
      display: none;
      flex-direction: column;
      justify-content: center;
      gap: 5px;
      width: 38px; height: 38px;
      padding: 9px 8px;
      background: #FFFFFF;
      border: 1px solid rgba(15,23,42,0.12);
      border-radius: 11px;
      cursor: pointer;
      margin-left: auto;
      flex-shrink: 0;
      transition: border-color .2s ease, background .2s ease;
    }
    .nav-hamburger:hover { border-color: rgba(15,23,42,0.28); background: #F8FAFC; }
    .nav-hamburger span {
      display: block;
      width: 100%; height: 2px;
      background: #0A1430;
      border-radius: 2px;
      transform-origin: center;
      transition: transform .25s ease, opacity .2s ease;
    }
    .nav-hamburger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
    .nav-hamburger.open span:nth-child(2) { opacity: 0; }
    .nav-hamburger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

    @media (max-width: 720px) {
      nav {
        flex-wrap: nowrap !important;
        gap: 10px !important;
        padding: 10px 16px !important;
        position: fixed !important;
      }
      .nav-hamburger { display: flex; }
      .nav-left { flex: 1; min-width: 0; gap: 10px !important; margin-right: 0 !important; order: 0 !important; flex-basis: auto !important; }
      .nav-logo { flex-shrink: 0 !important; margin-right: 0 !important; }

      /* Drop-down panel */
      .nav-links {
        position: absolute !important;
        top: 100% !important;
        left: 0 !important;
        right: 0 !important;
        background: rgba(235,240,250,0.98) !important;
        backdrop-filter: blur(22px) saturate(140%) !important;
        border-bottom: 1px solid rgba(15,23,42,0.08) !important;
        box-shadow: 0 14px 32px rgba(15,23,42,0.10) !important;
        padding: 14px 16px !important;
        margin: 0 !important;
        flex-direction: column !important;
        align-items: stretch !important;
        justify-content: flex-start !important;
        gap: 2px !important;
        list-style: none !important;
        flex-basis: auto !important;
        order: 0 !important;
        transform: translateY(-12px) !important;
        opacity: 0 !important;
        pointer-events: none !important;
        transition: transform .28s cubic-bezier(.16,1,.3,1), opacity .25s ease !important;
        z-index: 99 !important;
      }
      nav.nav-open .nav-links {
        transform: translateY(0) !important;
        opacity: 1 !important;
        pointer-events: auto !important;
      }
      .nav-links li { list-style: none !important; width: 100% !important; }
      .nav-links a {
        display: flex !important;
        align-items: center;
        gap: 10px;
        padding: 13px 14px !important;
        font-size: 14px !important;
        font-weight: 500 !important;
        text-transform: none !important;
        letter-spacing: 0 !important;
        border-radius: 10px !important;
        color: #0A1430 !important;
      }
      .nav-links a::after { display: none !important; }
      .nav-links a:hover { background: rgba(15,23,42,0.05) !important; }
      .nav-links a.active { background: rgba(30,58,138,0.08) !important; color: #1E3A8A !important; }

      /* Hide the inline desktop chatbar / spacer on phones */
      .nav-chatbar { display: none !important; }
      .nav-spacer { display: none !important; }

      .nav-cta { margin-left: 0 !important; padding: 9px 18px !important; font-size: 12px !important; }
    }

    /* Discreet footer link to the Founder Console (operator.html).
       Visible to everyone; the page itself redirects to /dunper_signin.html
       if the visitor isn't logged in as a founder. */
    .founder-link {
      color: #94A3B8 !important;
      font-size: 11.5px !important;
      font-weight: 500 !important;
      text-decoration: none !important;
      letter-spacing: 0 !important;
      transition: color .2s ease;
      -webkit-text-fill-color: #94A3B8 !important;
      background: none !important;
      -webkit-background-clip: padding-box !important;
      background-clip: padding-box !important;
    }
    .founder-link:hover {
      color: #1E3A8A !important;
      -webkit-text-fill-color: #1E3A8A !important;
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

  // ===== Hamburger / mobile nav =====
  function wireHamburger() {
    document.querySelectorAll('nav').forEach(nav => {
      // Only build a hamburger if this nav actually has a primary link list
      if (nav.querySelector('.nav-hamburger')) return;
      if (!nav.querySelector('.nav-links')) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-hamburger';
      btn.setAttribute('aria-label', 'Toggle menu');
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = '<span></span><span></span><span></span>';

      // Place it just before the Sign In CTA so the visual order is
      // [logo] … [hamburger] [Sign In] on every page layout.
      let insertBefore = nav.querySelector('.nav-cta');
      if (insertBefore && insertBefore.parentElement !== nav) {
        // Sign In is wrapped in an <a> (services/contact/join) — climb up.
        let parent = insertBefore.parentElement;
        while (parent && parent.parentElement !== nav) parent = parent.parentElement;
        insertBefore = parent || insertBefore;
      }
      if (insertBefore) nav.insertBefore(btn, insertBefore);
      else nav.appendChild(btn);

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const opened = nav.classList.toggle('nav-open');
        btn.classList.toggle('open', opened);
        btn.setAttribute('aria-expanded', opened ? 'true' : 'false');
      });

      // Close the panel when any link inside the dropdown is tapped
      nav.querySelectorAll('.nav-links a').forEach(a => {
        a.addEventListener('click', () => {
          nav.classList.remove('nav-open');
          btn.classList.remove('open');
          btn.setAttribute('aria-expanded', 'false');
        });
      });
    });

    // Close any open dropdown when clicking outside the nav
    document.addEventListener('click', (e) => {
      document.querySelectorAll('nav.nav-open').forEach(nav => {
        if (!nav.contains(e.target)) {
          nav.classList.remove('nav-open');
          const btn = nav.querySelector('.nav-hamburger');
          if (btn) {
            btn.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
          }
        }
      });
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      document.querySelectorAll('nav.nav-open').forEach(nav => {
        nav.classList.remove('nav-open');
        const btn = nav.querySelector('.nav-hamburger');
        if (btn) {
          btn.classList.remove('open');
          btn.setAttribute('aria-expanded', 'false');
        }
      });
    });
  }

  // Drop a discreet "Founder Console" link into every page's footer
  function injectFounderLink() {
    const footers = document.querySelectorAll('footer');
    if (!footers.length) return;
    footers.forEach(footer => {
      if (footer.querySelector('.founder-link')) return;
      const a = document.createElement('a');
      a.href = '/operator.html';
      a.className = 'founder-link';
      a.textContent = 'Founder Console →';
      a.title = 'Dunper AI Founder Dashboard (sign in required)';
      footer.appendChild(a);
    });
  }

  function init() {
    tagPage();
    injectStyles();
    wireChatbar();
    wireScrollAnim();
    wireHamburger();
    injectFounderLink();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
