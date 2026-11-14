import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_ONLY_TELEGRAM_EVENTS,
  escapeTelegramHtml,
  formatTelegramNotification,
  sendTelegramNotification,
  validateTelegramNotificationBody,
} from './telegram';

test('escapeTelegramHtml neutralizes HTML injection characters', () => {
  assert.equal(escapeTelegramHtml('<script>alert("x") & y</script>'), '&lt;script&gt;alert("x") &amp; y&lt;/script&gt;');
});

test('validateTelegramNotificationBody validates allowed types and rejects malformed input', () => {
  assert.equal(validateTelegramNotificationBody(null).ok, false);
  assert.equal(validateTelegramNotificationBody({ type: 'unknown_event' }).ok, false);
  assert.equal(validateTelegramNotificationBody({ type: 'spin', amount: -5 }).ok, false);

  const valid = validateTelegramNotificationBody({
    type: 'withdrawal_request',
    userName: 'করিম',
    method: 'bKash',
    maskedNumber: '017****5678',
    amount: 150,
    balance: 25.5,
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.event.type, 'withdrawal_request');
    assert.equal(valid.event.amount, 150);
    assert.equal(valid.event.balance, 25.5);
  }

  assert.equal(ADMIN_ONLY_TELEGRAM_EVENTS.has('admin_adjust'), true);
  assert.equal(ADMIN_ONLY_TELEGRAM_EVENTS.has('spin'), false);
});

test('formatTelegramNotification builds clear Bengali HTML messages for all key events', () => {
  const fixedDate = new Date('2026-11-13T10:00:00Z');

  const signup = formatTelegramNotification(
    {
      type: 'account_created',
      uid: 'u_123',
      userName: 'রহিম <admin>',
      refCode: 'TKRAH1234',
      referredBy: 'TKKAR9999',
      emailMasked: 'ra***m@gmail.com',
    },
    fixedDate
  );
  assert.match(signup, /নতুন অ্যাকাউন্ট তৈরি হয়েছে/);
  assert.match(signup, /রহিম &lt;admin&gt;/);
  assert.match(signup, /TKKAR9999/);

  const spin = formatTelegramNotification(
    { type: 'spin', uid: 'u_123', userName: 'রহিম', amount: 1.5, balance: 21.5 },
    fixedDate
  );
  assert.match(spin, /লাকি স্পিন আয়/);
  assert.match(spin, /\+৳1\.50/);
  assert.match(spin, /৳21\.50/);

  const support = formatTelegramNotification(
    {
      type: 'support_message',
      uid: 'u_123',
      userName: 'করিম',
      refCode: 'TKKAR1234',
      emailMasked: 'ka***m@gmail.com',
      userSuspended: true,
      text: 'দয়া করে <help> করুন ' + 'অ'.repeat(260),
    },
    fixedDate
  );
  assert.match(support, /নতুন লাইভ সাপোর্ট মেসেজ/);
  assert.match(support, /সাসপেন্ডেড অ্যাকাউন্ট/);
  assert.match(support, /মেসেজ প্রিভিউ:/);
  assert.match(support, /ka\*\*\*m@gmail\.com/);
  assert.match(support, /দয়া করে &lt;help&gt; করুন/);
  assert.match(support, /…<\/blockquote>/);
});

test('sendTelegramNotification skips when unconfigured and posts JSON payload when configured', async () => {
  const skipped = await sendTelegramNotification(
    { type: 'checkin', uid: 'u_1', amount: 0.05 },
    { botToken: '', chatId: '' }
  );
  assert.equal(skipped.ok, true);
  assert.equal(skipped.skipped, true);

  let calledUrl = '';
  let calledBody: Record<string, unknown> = {};
  const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calledUrl = String(url);
    calledBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  const sent = await sendTelegramNotification(
    { type: 'task', uid: 'u_1', userName: 'সালমা', taskTitle: 'বিজ্ঞাপন দেখুন', amount: 0.5, balance: 10 },
    { botToken: '123:TESTTOKEN', chatId: '8968701306', fetchImpl: mockFetch }
  );
  assert.equal(sent.ok, true);
  assert.match(calledUrl, /https:\/\/api\.telegram\.org\/bot123%3ATESTTOKEN\/sendMessage/);
  assert.equal(calledBody.chat_id, '8968701306');
  assert.equal(calledBody.parse_mode, 'HTML');
  assert.match(String(calledBody.text), /টাস্ক সম্পন্ন আয়/);
});
