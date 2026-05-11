/* Dunper marketing site — shared JS
 *
 * Provides:
 *   - Nav chatbar handler: navigates to the chat landing page with the typed
 *     question as a URL param. Works on both <form> and <div> chatbars.
 *   - Scroll-triggered fade-in animations on cards and sections.
 *   - Hover polish on cards, nav links and CTA buttons (injected as a single
 *     stylesheet so individual pages don't need to repeat it).
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

  // ===== Inject shared animation / hover stylesheet =====
  const animCss = `
    /* fade-in target list — kept hidden until JS marks <body> ready, so non-JS
       visitors still see everything. */
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
    /* stagger neighbouring cards in a grid so they cascade in */
    .scroll-anim-ready :is(.feature-grid, .step-list, .team-grid, .plans-grid, .values-grid) > *:nth-child(2)      { transition-delay: .08s; }
    .scroll-anim-ready :is(.feature-grid, .step-list, .team-grid, .plans-grid, .values-grid) > *:nth-child(3)      { transition-delay: .16s; }
    .scroll-anim-ready :is(.feature-grid, .step-list, .team-grid, .plans-grid, .values-grid) > *:nth-child(4)      { transition-delay: .24s; }
    .scroll-anim-ready :is(.team-grid, .plans-grid) > *:nth-child(5)                                                { transition-delay: .32s; }

    /* card hover lift (universal nudge) */
    .feature-card, .step, .team-card, .info-card, .value-card, .split-card {
      transition: transform .35s cubic-bezier(.16,1,.3,1),
                  border-color .3s ease,
                  box-shadow .35s ease,
                  opacity .65s cubic-bezier(.16,1,.3,1);
    }
    .feature-card:hover, .info-card:hover, .value-card:hover,
    .team-card:hover, .split-card:hover, .step:hover {
      transform: translateY(-7px) !important;
      box-shadow: 0 22px 50px rgba(15,112,240,.14) !important;
    }

    /* animated nav-link underline */
    .nav-links a { position: relative; }
    .nav-links a::after {
      content: '';
      position: absolute;
      left: 0;
      bottom: -5px;
      width: 100%;
      height: 2px;
      background: linear-gradient(90deg, #2E78D4, #0F70F0);
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

    /* CTA button shimmer sweep */
    .nav-cta, .submit-btn, .btn-primary, .plan-btn.featured-btn,
    .featured-btn, .composer button, .chatbar-send, .modal-actions button {
      position: relative;
      overflow: hidden;
      isolation: isolate;
    }
    .nav-cta::after, .submit-btn::after, .btn-primary::after,
    .plan-btn.featured-btn::after, .composer button::after,
    .chatbar-send::after, .modal-actions button::after {
      content: '';
      position: absolute;
      top: 0;
      left: -120%;
      width: 60%;
      height: 100%;
      background: linear-gradient(120deg, transparent 0%, rgba(255,255,255,.32) 50%, transparent 100%);
      transform: skewX(-18deg);
      transition: left .6s cubic-bezier(.4,0,.2,1);
      pointer-events: none;
      z-index: 1;
    }
    .nav-cta:hover::after, .submit-btn:hover::after, .btn-primary:hover::after,
    .plan-btn.featured-btn:hover::after, .composer button:hover::after,
    .chatbar-send:hover::after, .modal-actions button:hover::after {
      left: 130%;
    }

    /* Logo hover wiggle */
    .nav-logo .logo-img {
      transition: transform .45s cubic-bezier(.16,1,.3,1);
    }
    .nav-logo:hover .logo-img {
      transform: rotate(-8deg) scale(1.08);
    }

    /* Floating hero orbs pulse harder for visibility on light bg */
    @keyframes orbFloat {
      0%,100% { transform: translate3d(0,0,0); }
      50%     { transform: translate3d(0,-14px,0); }
    }
    .hero-orb, .bg-orb {
      animation: orbFloat 7s ease-in-out infinite !important;
    }
    .hero-orb.orb2, .bg-orb.bg2 { animation-delay: 1.8s !important; }
    .hero-orb.orb3 { animation-delay: 3.4s !important; }

    /* Honour reduced-motion */
    @media (prefers-reduced-motion: reduce) {
      .scroll-anim-ready :is(.section, .feature-card, .step, .team-card,
        .split-card, .plan-card, .info-card, .value-card, .auth-card,
        .compare-section, .invoice-box, .terms-box, .mission-section,
        .timeline-item, .chat-window, .composer) {
        opacity: 1 !important;
        transform: none !important;
        transition: none !important;
      }
      .hero-orb, .bg-orb { animation: none !important; }
      .nav-links a::after { transition: none !important; }
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

  function init() {
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
