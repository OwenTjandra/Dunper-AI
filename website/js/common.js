/* Dunper marketing site — shared JS
 *
 * Nav chatbar: pressing Enter or clicking send navigates to the chat
 * landing page with the typed question as a URL parameter so the chat
 * page can render it as the first user message.
 */

(function () {
  const bar = document.getElementById('nav-chatbar');
  if (!bar) return;
  const input = bar.querySelector('input');
  if (!input) return;

  bar.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = (input.value || '').trim();
    const dest = 'dunper_chat.html' + (q ? '?q=' + encodeURIComponent(q) : '');
    window.location.href = dest;
  });
})();
