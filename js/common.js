/* Dunper marketing site — shared JS
 *
 * Edit DEMO_URL when the Cloudflare quick-tunnel rotates, or when you set up
 * a permanent named tunnel (e.g. https://app.dunper.com).
 */
const DEMO_URL = 'https://equally-logic-theta-mysql.trycloudflare.com';

// ---- Nav chatbar: clicking send (or pressing Enter) opens the live demo
//      in a new tab. The typed question is preserved via sessionStorage so
//      the chatbot UI on the demo side can pick it up if it wants.
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
    window.open(DEMO_URL, '_blank', 'noopener');
  });
})();
