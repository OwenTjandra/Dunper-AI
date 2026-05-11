#!/usr/bin/env node
/* Seed Dunper AI's local SQLite database with realistic demo content so
 * the dashboards look "alive" during a pitch.
 *
 * Run from the repo root:
 *
 *   node scripts/seed-demo-data.js          # idempotent — skips if already seeded
 *   node scripts/seed-demo-data.js --reset  # delete previous demo rows first
 *
 * What gets seeded:
 *   - 8 customer_profiles (each gets a back-and-forth conversation)
 *   - 4 bookings (mix of today/tomorrow, mostly confirmed)
 *   - 1 escalation (Pak Joko asked about laser → bot handed off)
 *   - 2 unanswered questions (drives the "Unanswered" admin card)
 *   - 5 sales_clients (one per pipeline stage)
 *   - 30 days of synthetic anthropic_usage_log rows
 *
 * Everything is tagged with session_id prefix "demo-seed-" so --reset can
 * find it cleanly. Real production data is never touched.
 */
const path = require('path');
process.chdir(path.join(__dirname, '..'));

const { db } = require('../src/db');
require('../src/migrations').runPending(db);
const {
  createBooking,
  createSalesClient,
  recordAnthropicUsage,
} = require('../src/db');

const DEMO_PREFIX = 'demo-seed-';
const args = new Set(process.argv.slice(2));
const RESET = args.has('--reset');

// ---------- Optional reset ----------
function reset() {
  console.log('🧹 Wiping previous demo rows...');
  const profileIds = db.prepare(
    "SELECT id FROM customer_profiles WHERE session_id LIKE ?"
  ).all(DEMO_PREFIX + '%').map(r => r.id);

  for (const id of profileIds) {
    db.prepare('DELETE FROM customer_message_attachments WHERE profile_id = ?').run(id);
    db.prepare('DELETE FROM customer_messages WHERE profile_id = ?').run(id);
    db.prepare('DELETE FROM customer_summaries WHERE profile_id = ?').run(id);
    db.prepare('DELETE FROM bookings WHERE profile_id = ?').run(id);
    db.prepare('DELETE FROM escalations WHERE profile_id = ?').run(id);
    db.prepare('DELETE FROM conversation_compactions WHERE profile_id = ?').run(id);
  }
  db.prepare("DELETE FROM customer_profiles WHERE session_id LIKE ?").run(DEMO_PREFIX + '%');
  db.prepare("DELETE FROM sales_clients WHERE business_name LIKE 'DEMO · %'").run();
  db.prepare("DELETE FROM unanswered_questions WHERE question_text LIKE 'DEMO ·%' OR id IN (SELECT id FROM unanswered_questions WHERE created_at > datetime('now','-2 hours') AND (question_text LIKE '%laser%' OR question_text LIKE '%refund%'))").run();
  db.prepare("DELETE FROM anthropic_usage_log WHERE call_site = 'demo-seed'").run();
  console.log('   …done.');
}

// ---------- Skip check ----------
function alreadySeeded() {
  const n = db.prepare("SELECT COUNT(*) AS n FROM customer_profiles WHERE session_id LIKE ?")
    .get(DEMO_PREFIX + '%').n;
  return n > 0;
}

// ---------- Data ----------
function nowOffset(daysAhead, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

const conversations = [
  {
    session: DEMO_PREFIX + 'sari',
    name: 'Sari Wijaya',
    phone: '+62 812-3456-7890',
    email: 'sari.w@gmail.com',
    notes: 'Regular customer · prefers Saturday slots',
    summary: 'Booked haircut for tomorrow 2pm. Asked about loyalty discount — bot referred to current promo.',
    intent: 'booking',
    sentiment: 'positive',
    messages: [
      ['customer', 'Halo, do you have any slots tomorrow afternoon for a haircut?'],
      ['assistant', 'Hi Sari! Tomorrow we have 2pm, 3pm, and 4pm open. Which would you like?'],
      ['customer', '2pm please. Will the same stylist be there?'],
      ['assistant', 'Yes — Mbak Tanti is on. Want me to book 2pm with her?'],
      ['customer', 'Yes please!'],
      ['assistant', '✓ Done! See you tomorrow at 2pm. Confirmation sent to your email.'],
      ['customer', 'Any loyalty discount for regulars by the way?'],
      ['assistant', 'You\'re eligible for our 10% loyalty discount after 5 visits. You\'re at 4 — one more and your next cut is 10% off!'],
    ],
  },
  {
    session: DEMO_PREFIX + 'budi',
    name: 'Budi Santoso',
    phone: '+62 813-2222-1111',
    email: null,
    notes: null,
    summary: 'Asked about opening hours, didn\'t book yet.',
    intent: 'info',
    sentiment: 'neutral',
    messages: [
      ['customer', 'what time do you open tomorrow?'],
      ['assistant', 'We\'re open 9am to 7pm tomorrow. Want me to check availability for any service?'],
      ['customer', 'maybe later, thanks'],
    ],
  },
  {
    session: DEMO_PREFIX + 'aisha',
    name: 'Aisha Putri',
    phone: '+62 815-9988-7766',
    email: 'aisha.p@hotmail.com',
    notes: 'Bahasa speaker · prefers Indonesian',
    summary: 'Booked pedicure for tomorrow 4pm. Confirmed parking availability.',
    intent: 'booking',
    sentiment: 'positive',
    messages: [
      ['customer', 'halo, masih ada slot besok untuk pedicure?'],
      ['assistant', 'Halo Aisha! Besok pukul 4 sore dan 5 sore masih kosong. Mau yang mana?'],
      ['customer', 'jam 4 aja. ada parkir mobil?'],
      ['assistant', 'Iya, kami punya parkir di basement gedung — gratis untuk pelanggan. Mau saya konfirmasi booking jam 4 sore?'],
      ['customer', 'iya konfirm'],
      ['assistant', '✓ Booking pedicure besok jam 4 sore sudah dikonfirmasi. Sampai bertemu!'],
    ],
  },
  {
    session: DEMO_PREFIX + 'joko',
    name: 'Pak Joko',
    phone: '+62 811-5555-3333',
    email: null,
    notes: 'Asked for service we don\'t offer · escalated to owner',
    summary: 'Asked about laser hair removal which we don\'t offer. Bot escalated cleanly.',
    intent: 'info',
    sentiment: 'neutral',
    messages: [
      ['customer', 'do you do laser hair removal?'],
      ['assistant', "I don\'t have info on laser hair removal — that may not be a service we currently offer. Would you like me to connect you with the owner who can confirm?"],
      ['customer', 'yes please'],
      ['assistant', "I\'ve flagged this for the owner — they\'ll reach out shortly. In the meantime, can I help with anything else (haircut, manicure, facial)?"],
    ],
    escalate: 'Customer asked about laser hair removal — we don\'t offer this. Possibly worth adding or referring out.',
  },
  {
    session: DEMO_PREFIX + 'nina',
    name: 'Nina Halim',
    phone: '+62 812-7777-4444',
    email: 'nina@startup.id',
    notes: null,
    summary: 'Booked haircut for day after tomorrow 10am.',
    intent: 'booking',
    sentiment: 'positive',
    messages: [
      ['customer', 'morning slots day after tomorrow?'],
      ['assistant', 'Day after tomorrow we have 9am, 10am, and 11am open. Which works?'],
      ['customer', '10am'],
      ['assistant', 'What service? Haircut, color, or something else?'],
      ['customer', 'just a haircut'],
      ['assistant', "✓ Haircut booked for 10am day after tomorrow. Name and phone for the booking?"],
      ['customer', 'Nina Halim, 0812-7777-4444'],
      ['assistant', '✓ All set Nina! See you then.'],
    ],
  },
  {
    session: DEMO_PREFIX + 'reza',
    name: 'Reza Pratama',
    phone: '+62 819-1212-3434',
    email: 'reza.p@gmail.com',
    notes: 'Asked about eyebrow threading pricing in Bahasa',
    summary: 'Asked pricing for eyebrow threading, then booked for day after tomorrow 3pm.',
    intent: 'booking',
    sentiment: 'positive',
    messages: [
      ['customer', 'berapa harga eyebrow threading?'],
      ['assistant', 'Eyebrow threading kami Rp 75.000. Sudah termasuk konsultasi bentuk alis sesuai wajah. Mau booking?'],
      ['customer', 'iya, lusa sore bisa?'],
      ['assistant', 'Lusa pukul 2, 3, atau 5 sore tersedia. Mau jam berapa?'],
      ['customer', 'jam 3 ya'],
      ['assistant', '✓ Eyebrow threading lusa pukul 3 sore. Nama dan nomor untuk booking?'],
      ['customer', 'Reza Pratama, 0819-1212-3434'],
      ['assistant', '✓ Booking dikonfirmasi! Sampai bertemu lusa.'],
    ],
  },
  {
    session: DEMO_PREFIX + 'maya',
    name: 'Maya Kusuma',
    phone: '+62 818-3030-2020',
    email: null,
    notes: 'Asked cancellation policy — bot escalated',
    summary: 'Tried to reschedule but unsure of policy. Asked about cancellation fees — bot didn\'t have full info.',
    intent: 'support',
    sentiment: 'neutral',
    messages: [
      ['customer', 'I need to reschedule my booking, what\'s the cancellation policy?'],
      ['assistant', 'I can help reschedule! What\'s the current booking time and what time would you like?'],
      ['customer', "wait first, is there a fee if I cancel?"],
      ['assistant', "I\'m not sure of the exact cancellation policy — let me flag this for the owner so you get the right answer. In the meantime, would you like to reschedule (no fee for rescheduling)?"],
      ['customer', 'ok let me think'],
    ],
  },
  {
    session: DEMO_PREFIX + 'chen',
    name: 'Chen Hui',
    phone: '+62 821-4040-5050',
    email: 'chen.hui@hotmail.com',
    notes: 'Mandarin speaker · happy with service',
    summary: 'Asked about waxing service in Mandarin, decided to book later.',
    intent: 'info',
    sentiment: 'positive',
    messages: [
      ['customer', '你们有蜜蜡脱毛服务吗?'],
      ['assistant', '有的!我们提供腿部、手臂、和上唇蜜蜡脱毛。价格从 Rp 100,000 起。需要帮您预约吗?'],
      ['customer', '我考虑一下,谢谢'],
      ['assistant', '当然!需要预约的时候随时告诉我。'],
    ],
  },
];

// ---------- Insert ----------
function seed() {
  console.log('🌱 Seeding demo data...');

  // Profiles + messages + summaries
  const insertProfile = db.prepare(
    "INSERT INTO customer_profiles (session_id, name, phone, email, notes) VALUES (?, ?, ?, ?, ?)"
  );
  const insertMsg = db.prepare(
    "INSERT INTO customer_messages (profile_id, role, content) VALUES (?, ?, ?)"
  );
  const insertSummary = db.prepare(
    "INSERT INTO customer_summaries (profile_id, summary, sentiment, intent) VALUES (?, ?, ?, ?)"
  );
  const insertEscalation = db.prepare(
    "INSERT INTO escalations (profile_id, reason, status) VALUES (?, ?, 'pending')"
  );
  const insertUnanswered = db.prepare(
    "INSERT INTO unanswered_questions (profile_id, question_text, status) VALUES (?, ?, 'open')"
  );

  for (const c of conversations) {
    const r = insertProfile.run(c.session, c.name, c.phone, c.email, c.notes);
    const profileId = r.lastInsertRowid;
    for (const [role, content] of c.messages) {
      insertMsg.run(profileId, role === 'customer' ? 'user' : role, content);
    }
    insertSummary.run(profileId, c.summary, c.sentiment, c.intent);
    if (c.escalate) {
      insertEscalation.run(profileId, c.escalate);
    }
  }
  console.log(`   ✓ ${conversations.length} customer profiles + conversations + summaries`);

  // Bookings — Sari (2pm tmrw), Aisha (4pm tmrw), Nina (10am +2d), Reza (3pm +2d)
  const sari   = db.prepare("SELECT id FROM customer_profiles WHERE session_id = ?").get(DEMO_PREFIX + 'sari').id;
  const aisha  = db.prepare("SELECT id FROM customer_profiles WHERE session_id = ?").get(DEMO_PREFIX + 'aisha').id;
  const nina   = db.prepare("SELECT id FROM customer_profiles WHERE session_id = ?").get(DEMO_PREFIX + 'nina').id;
  const reza   = db.prepare("SELECT id FROM customer_profiles WHERE session_id = ?").get(DEMO_PREFIX + 'reza').id;

  const bookings = [
    { profileId: sari,  customerName: 'Sari Wijaya',  customerPhone: '+62 812-3456-7890', customerEmail: 'sari.w@gmail.com',  serviceName: 'Haircut',           durationMinutes: 45, startsAt: nowOffset(1, 14, 0), endsAt: nowOffset(1, 14, 45), source: 'web' },
    { profileId: aisha, customerName: 'Aisha Putri',  customerPhone: '+62 815-9988-7766', customerEmail: 'aisha.p@hotmail.com', serviceName: 'Pedicure',         durationMinutes: 60, startsAt: nowOffset(1, 16, 0), endsAt: nowOffset(1, 17, 0), source: 'web' },
    { profileId: nina,  customerName: 'Nina Halim',   customerPhone: '+62 812-7777-4444', customerEmail: 'nina@startup.id',    serviceName: 'Haircut',           durationMinutes: 45, startsAt: nowOffset(2, 10, 0), endsAt: nowOffset(2, 10, 45), source: 'web' },
    { profileId: reza,  customerName: 'Reza Pratama', customerPhone: '+62 819-1212-3434', customerEmail: 'reza.p@gmail.com',   serviceName: 'Eyebrow Threading', durationMinutes: 30, startsAt: nowOffset(2, 15, 0), endsAt: nowOffset(2, 15, 30), source: 'web' },
  ];
  for (const b of bookings) createBooking(b);
  console.log(`   ✓ ${bookings.length} bookings (mix of tomorrow + day after)`);

  // Escalations — already added Joko's via insertEscalation above. Also Maya's.
  const maya = db.prepare("SELECT id FROM customer_profiles WHERE session_id = ?").get(DEMO_PREFIX + 'maya').id;
  insertEscalation.run(maya, "Asked about cancellation policy — bot didn\'t have full info.");
  console.log(`   ✓ 2 escalations (Pak Joko · laser, Maya · cancellation policy)`);

  // Unanswered questions (drives admin card)
  const joko = db.prepare("SELECT id FROM customer_profiles WHERE session_id = ?").get(DEMO_PREFIX + 'joko').id;
  insertUnanswered.run(joko, 'Do you do laser hair removal?');
  insertUnanswered.run(maya, "What\'s your cancellation policy and refund fees?");
  console.log(`   ✓ 2 unanswered questions`);

  // Sales pipeline — 5 prospects across the funnel
  const today = new Date();
  function plusDays(n) {
    const d = new Date(today); d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }
  const prospects = [
    { businessName: 'DEMO · Salon Citra',          contactName: 'Bu Linda',      contactEmail: 'linda@saloncitra.id',    contactPhone: '+62 21-555-0101', vertical: 'salon',      status: 'active',         plan: 'pro',     mrrUsd: 20, nextStep: 'Monthly check-in call',          nextStepAt: plusDays(14), notes: 'First paying customer · happy · referring others' },
    { businessName: 'DEMO · Klinik Gigi Sehat',    contactName: 'Drg. Rina',     contactEmail: 'rina@kgsehat.id',        contactPhone: '+62 21-555-0202', vertical: 'dental',     status: 'demo_done',      plan: 'max',     mrrUsd: 50, nextStep: 'Send proposal',                   nextStepAt: plusDays(2),  notes: 'Loved the demo · needs to talk to her partner' },
    { businessName: 'DEMO · Bakso Pak Joko',       contactName: 'Pak Joko',      contactEmail: 'pakjokoresto@gmail.com', contactPhone: '+62 21-555-0303', vertical: 'restaurant', status: 'demo_scheduled', plan: null,      mrrUsd: 0,  nextStep: 'Demo at 3pm Friday',              nextStepAt: plusDays(3),  notes: 'WhatsApp-only business · 200 orders/day' },
    { businessName: 'DEMO · Tukang Cukur Bagas',   contactName: 'Bagas',         contactEmail: null,                     contactPhone: '+62 21-555-0404', vertical: 'salon',      status: 'lead',           plan: null,      mrrUsd: 0,  nextStep: 'Send intro WhatsApp',              nextStepAt: plusDays(1),  notes: 'Referred by Salon Citra' },
    { businessName: 'DEMO · Spa Permata',           contactName: 'Tara Permata',  contactEmail: 'tara@spapermata.id',     contactPhone: '+62 21-555-0505', vertical: 'spa',        status: 'proposal_sent',  plan: 'pro',     mrrUsd: 20, nextStep: 'Follow up on proposal',           nextStepAt: plusDays(5),  notes: '4 locations · could be biggest customer' },
  ];
  for (const p of prospects) createSalesClient(p);
  console.log(`   ✓ ${prospects.length} sales prospects (lead → active spread)`);

  // Anthropic usage log — synthetic 30 days so cost graph isn't empty
  for (let daysAgo = 30; daysAgo >= 0; daysAgo--) {
    const calls = 8 + Math.floor(Math.random() * 14); // 8-22 calls/day
    for (let i = 0; i < calls; i++) {
      const input = 800 + Math.floor(Math.random() * 1500);
      const output = 200 + Math.floor(Math.random() * 700);
      const cacheCreate = i === 0 ? 1500 : 0; // first call of day creates cache
      const cacheRead = i === 0 ? 0 : 1500;   // subsequent calls hit cache
      const cost = (input * 3 + output * 15 + cacheCreate * 3.75 + cacheRead * 0.30) / 1_000_000;
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - daysAgo);
      createdAt.setHours(9 + Math.floor(i * 12 / calls), Math.floor(Math.random() * 60));
      db.prepare(`
        INSERT INTO anthropic_usage_log
          (call_site, profile_id, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, cost_usd, created_at)
        VALUES ('demo-seed', NULL, 'claude-sonnet-4-6', ?, ?, ?, ?, ?, ?)
      `).run(input, output, cacheCreate, cacheRead, cost, createdAt.toISOString().replace('T',' ').replace(/\.\d+Z$/, ''));
    }
  }
  const totalCost = db.prepare("SELECT SUM(cost_usd) AS s FROM anthropic_usage_log WHERE call_site = 'demo-seed'").get().s;
  console.log(`   ✓ 30 days of Anthropic usage history (~$${totalCost.toFixed(2)} total)`);

  console.log('');
  console.log('🎉 Demo seed complete. Open http://localhost:3000/admin.html and http://localhost:3000/operator.html');
}

if (RESET) reset();
if (alreadySeeded() && !RESET) {
  console.log('ℹ️  Demo data already present. Run with --reset to wipe and re-seed.');
  process.exit(0);
}
seed();
