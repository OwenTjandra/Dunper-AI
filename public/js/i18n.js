const TRANSLATIONS = {
  en: {
    online: 'Online',
    book: 'Book',
    typeMessage: 'Type your message...',
    send: 'Send',
    attachImage: 'Attach image',
    removeAttachment: 'Remove attachment',
    chatOnWhatsApp: 'Chat on WhatsApp',
    close: 'Close',

    bookTitle: 'Book an appointment',
    service: 'Service',
    date: 'Date',
    availableTimes: 'Available times',
    pickDateHint: 'Pick a date to see times.',
    pickDateAndService: 'Pick a date and service to see times.',
    yourName: 'Your name',
    phone: 'Phone',
    email: 'Email',
    confirmBooking: 'Confirm booking',
    booking: 'Booking…',
    bookedShort: 'Booked!',
    noSlots: 'No available times — try another day.',
    loading: 'Loading…',
    failedLoadServices: 'Failed to load services',

    greeting: "Hi! I'm Dunper, your assistant. How can I help you today?",
    couldntLoadHistory: "Couldn't load history",
    error: 'Error',
    networkError: 'Network error',
    booked: 'Booked',
    seeYouThen: "We'll see you then!",
    askHuman: 'Human',
    handoffSent: "We've notified the team. Someone will get back to you shortly.",
    handoffFailed: "Couldn't notify the team — please try again.",
  },
  id: {
    online: 'Online',
    book: 'Pesan',
    typeMessage: 'Ketik pesan Anda...',
    send: 'Kirim',
    attachImage: 'Lampirkan gambar',
    removeAttachment: 'Hapus lampiran',
    chatOnWhatsApp: 'Chat via WhatsApp',
    close: 'Tutup',

    bookTitle: 'Buat Janji',
    service: 'Layanan',
    date: 'Tanggal',
    availableTimes: 'Waktu Tersedia',
    pickDateHint: 'Pilih tanggal untuk melihat waktu.',
    pickDateAndService: 'Pilih tanggal dan layanan untuk melihat waktu.',
    yourName: 'Nama Anda',
    phone: 'Nomor Telepon',
    email: 'Email',
    confirmBooking: 'Konfirmasi Pemesanan',
    booking: 'Memproses…',
    bookedShort: 'Berhasil!',
    noSlots: 'Tidak ada waktu tersedia — coba hari lain.',
    loading: 'Memuat…',
    failedLoadServices: 'Gagal memuat layanan',

    greeting: 'Halo! Saya Dunper, asisten Anda. Ada yang bisa saya bantu?',
    couldntLoadHistory: 'Tidak dapat memuat riwayat',
    error: 'Kesalahan',
    networkError: 'Kesalahan jaringan',
    booked: 'Terjadwal',
    seeYouThen: 'Sampai jumpa nanti!',
    askHuman: 'Manusia',
    handoffSent: 'Tim sudah kami beri tahu. Seseorang akan segera menghubungi Anda.',
    handoffFailed: 'Gagal memberi tahu tim — coba lagi.',
  },
};

const I18N_KEY = 'frontdesk_lang';
const SUPPORTED = Object.keys(TRANSLATIONS);

function detectInitialLang() {
  const saved = localStorage.getItem(I18N_KEY);
  if (saved && SUPPORTED.includes(saved)) return saved;
  const browser = (navigator.language || 'en').toLowerCase();
  if (browser.startsWith('id')) return 'id';
  return 'en';
}

let currentLang = detectInitialLang();

function t(key) {
  return TRANSLATIONS[currentLang]?.[key] ?? TRANSLATIONS.en[key] ?? key;
}

function applyLanguage() {
  document.documentElement.lang = currentLang;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    el.title = t(key);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria-label');
    el.setAttribute('aria-label', t(key));
  });

  const picker = document.getElementById('lang-picker');
  if (picker) picker.value = currentLang;

  window.dispatchEvent(new CustomEvent('languagechange', { detail: { lang: currentLang } }));
}

function setLanguage(lang) {
  if (!SUPPORTED.includes(lang)) return;
  currentLang = lang;
  localStorage.setItem(I18N_KEY, lang);
  applyLanguage();
}

window.t = t;
window.setLanguage = setLanguage;
window.getCurrentLang = () => currentLang;

document.addEventListener('DOMContentLoaded', () => {
  applyLanguage();
  const picker = document.getElementById('lang-picker');
  if (picker) {
    picker.value = currentLang;
    picker.addEventListener('change', (e) => setLanguage(e.target.value));
  }
});
