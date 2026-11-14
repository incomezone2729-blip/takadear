export type TelegramEventType =
  | 'account_created'
  | 'checkin'
  | 'task'
  | 'spin'
  | 'referral_bonus'
  | 'referral_friend_bonus'
  | 'account_submission'
  | 'account_approved'
  | 'withdrawal_request'
  | 'withdrawal_status'
  | 'admin_adjust'
  | 'support_message';

export const TELEGRAM_EVENT_TYPES: readonly TelegramEventType[] = [
  'account_created',
  'checkin',
  'task',
  'spin',
  'referral_bonus',
  'referral_friend_bonus',
  'account_submission',
  'account_approved',
  'withdrawal_request',
  'withdrawal_status',
  'admin_adjust',
  'support_message',
];

export const ADMIN_ONLY_TELEGRAM_EVENTS: ReadonlySet<TelegramEventType> = new Set([
  'account_approved',
  'withdrawal_status',
  'admin_adjust',
]);

export interface TelegramClientNotificationInput {
  type: TelegramEventType;
  userName?: string;
  refCode?: string;
  referredBy?: string;
  targetUid?: string;
  amount?: number;
  delta?: number;
  balance?: number;
  streakDay?: number;
  taskId?: string;
  taskTitle?: string;
  prizeIndex?: number;
  count?: number;
  platform?: 'gmail' | 'facebook';
  maskedIdentifier?: string;
  method?: string;
  maskedNumber?: string;
  receiptId?: string;
  status?: string;
  note?: string;
  userSuspended?: boolean;
  text?: string;
}

export interface TelegramNotificationPayload extends TelegramClientNotificationInput {
  uid: string;
  emailMasked?: string | null;
}

export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function cleanStr(val: unknown, maxLen = 120): string | undefined {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function cleanMoney(val: unknown): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const num = Number(val);
  if (!Number.isFinite(num)) return undefined;
  return Math.round(num * 100) / 100;
}

function formatTaka(val: number | undefined): string {
  const num = Number(val ?? 0);
  return `৳${(Number.isFinite(num) ? num : 0).toFixed(2)}`;
}

export function formatDhakaTimestamp(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function validateTelegramNotificationBody(
  body: unknown
): { ok: true; event: TelegramClientNotificationInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid notification body' };
  }
  const raw = body as Record<string, unknown>;
  const type = raw.type;
  if (typeof type !== 'string' || !TELEGRAM_EVENT_TYPES.includes(type as TelegramEventType)) {
    return { ok: false, error: 'Unsupported Telegram notification type' };
  }

  const amount = cleanMoney(raw.amount);
  const delta = cleanMoney(raw.delta);
  const balance = cleanMoney(raw.balance);
  if (amount !== undefined && (amount < 0 || amount > 1000000)) {
    return { ok: false, error: 'Invalid amount' };
  }

  const platform =
    raw.platform === 'gmail' || raw.platform === 'facebook' ? raw.platform : undefined;

  return {
    ok: true,
    event: {
      type: type as TelegramEventType,
      userName: cleanStr(raw.userName, 80),
      refCode: cleanStr(raw.refCode, 24),
      referredBy: cleanStr(raw.referredBy, 24),
      targetUid: cleanStr(raw.targetUid, 128),
      amount,
      delta,
      balance,
      streakDay: Number.isInteger(Number(raw.streakDay)) ? Number(raw.streakDay) : undefined,
      taskId: cleanStr(raw.taskId, 32),
      taskTitle: cleanStr(raw.taskTitle, 80),
      prizeIndex: Number.isInteger(Number(raw.prizeIndex)) ? Number(raw.prizeIndex) : undefined,
      count: Number.isInteger(Number(raw.count)) ? Number(raw.count) : undefined,
      platform,
      maskedIdentifier: cleanStr(raw.maskedIdentifier, 120),
      method: cleanStr(raw.method, 32),
      maskedNumber: cleanStr(raw.maskedNumber, 32),
      receiptId: cleanStr(raw.receiptId, 64),
      status: cleanStr(raw.status, 40),
      note: cleanStr(raw.note, 240),
      userSuspended: typeof raw.userSuspended === 'boolean' ? raw.userSuspended : undefined,
      text: cleanStr(raw.text, 600),
    },
  };
}

export function formatTelegramNotification(
  event: TelegramNotificationPayload,
  now: Date = new Date()
): string {
  const userName = escapeTelegramHtml(event.userName || 'ব্যবহারকারী');
  const refPart = event.refCode ? ` (${escapeTelegramHtml(event.refCode)})` : '';
  const emailPart = event.emailMasked ? `\n📧 <b>ইমেইল:</b> <code>${escapeTelegramHtml(event.emailMasked)}</code>` : '';
  const uidPart = `\n🆔 <b>UID:</b> <code>${escapeTelegramHtml(event.targetUid || event.uid)}</code>`;
  const balancePart =
    event.balance !== undefined
      ? `\n💳 <b>বর্তমান ব্যালেন্স:</b> <b>${formatTaka(event.balance)}</b>`
      : '';
  const timePart = `\n🕒 <i>${escapeTelegramHtml(formatDhakaTimestamp(now))}</i>`;

  switch (event.type) {
    case 'account_created': {
      const refBy = event.referredBy
        ? `\n🤝 <b>রেফার কোড ব্যবহার:</b> <code>${escapeTelegramHtml(event.referredBy)}</code>`
        : '';
      return (
        `🆕 <b>নতুন অ্যাকাউন্ট তৈরি হয়েছে!</b>\n` +
        `👤 <b>নাম:</b> ${userName}${refPart}` +
        emailPart +
        uidPart +
        refBy +
        timePart
      );
    }
    case 'checkin': {
      return (
        `📅 <b>দৈনিক চেক-ইন আয়</b>\n` +
        `👤 <b>ইউজার:</b> ${userName}${refPart}\n` +
        `🔥 <b>দিন:</b> দিন ${event.streakDay ?? 1}\n` +
        `💰 <b>আয়:</b> +${formatTaka(event.amount)}` +
        balancePart +
        timePart
      );
    }
    case 'task': {
      return (
        `✅ <b>টাস্ক সম্পন্ন আয়</b>\n` +
        `👤 <b>ইউজার:</b> ${userName}${refPart}\n` +
        `🧩 <b>টাস্ক:</b> ${escapeTelegramHtml(event.taskTitle || event.taskId || 'টাস্ক')}\n` +
        `💰 <b>আয়:</b> +${formatTaka(event.amount)}` +
        balancePart +
        timePart
      );
    }
    case 'spin': {
      return (
        `🎡 <b>লাকি স্পিন আয়!</b>\n` +
        `👤 <b>ইউজার:</b> ${userName}${refPart}\n` +
        `💰 <b>পুরস্কার:</b> +${formatTaka(event.amount)}` +
        balancePart +
        timePart
      );
    }
    case 'referral_bonus': {
      return (
        `🤝 <b>রেফারেল বোনাস আয়</b>\n` +
        `👤 <b>ইউজার:</b> ${userName}${refPart}\n` +
        `👥 <b>সংখ্যা:</b> ${event.count ?? 1}টি রেফারেল\n` +
        `💰 <b>মোট আয়:</b> +${formatTaka(event.amount)}` +
        balancePart +
        timePart
      );
    }
    case 'referral_friend_bonus': {
      return (
        `🎁 <b>রেফারেল স্বাগত বোনাস আয়</b>\n` +
        `👤 <b>ইউজার:</b> ${userName}${refPart}\n` +
        `💰 <b>বোনাস:</b> +${formatTaka(event.amount)}` +
        balancePart +
        timePart
      );
    }
    case 'account_submission': {
      const platformLabel = event.platform === 'facebook' ? 'ফেসবুক সেল' : 'জিমেইল সেল';
      const icon = event.platform === 'facebook' ? '📘' : '📧';
      return (
        `${icon} <b>নতুন অ্যাকাউন্ট টাস্ক জমা হয়েছে</b>\n` +
        `👤 <b>ইউজার:</b> ${userName}${refPart}\n` +
        `🏷️ <b>ধরন:</b> ${platformLabel}\n` +
        `🔎 <b>অ্যাকাউন্ট:</b> <code>${escapeTelegramHtml(event.maskedIdentifier || '***')}</code>\n` +
        `💰 <b>সম্ভাব্য মূল্য:</b> ${formatTaka(event.amount)}\n` +
        `⏳ <b>স্ট্যাটাস:</b> পেন্ডিং (অ্যাডমিন রিভিউ বাকি)` +
        timePart
      );
    }
    case 'account_approved': {
      const platformLabel = event.platform === 'facebook' ? 'ফেসবুক সেল' : 'জিমেইল সেল';
      const isApproved = event.status === 'এপ্রুভড';
      const noteLine = event.note ? `\n📝 <b>নোট:</b> ${escapeTelegramHtml(event.note)}` : '';
      return (
        `${isApproved ? '🎉' : '❌'} <b>অ্যাকাউন্ট সাবমিশন ${escapeTelegramHtml(event.status || 'আপডেট')}</b>\n` +
        `👤 <b>ইউজার:</b> ${userName}${uidPart}\n` +
        `🏷️ <b>ধরন:</b> ${platformLabel} (<code>${escapeTelegramHtml(event.maskedIdentifier || '***')}</code>)\n` +
        `💰 <b>মূল্য:</b> ${formatTaka(event.amount)}` +
        noteLine +
        timePart
      );
    }
    case 'withdrawal_request': {
      const rcpt = event.receiptId ? `\n🧾 <b>রসিদ:</b> <code>${escapeTelegramHtml(event.receiptId)}</code>` : '';
      return (
        `🏦 <b>নতুন উইথড্র রিকোয়েস্ট!</b>\n` +
        `👤 <b>ইউজার:</b> ${userName}${refPart}\n` +
        `📲 <b>মাধ্যম:</b> ${escapeTelegramHtml(event.method || 'bKash')}\n` +
        `📞 <b>নম্বর:</b> <code>${escapeTelegramHtml(event.maskedNumber || '***')}</code>\n` +
        `💸 <b>পরিমাণ:</b> <b>${formatTaka(event.amount)}</b>` +
        balancePart +
        rcpt +
        timePart
      );
    }
    case 'withdrawal_status': {
      const isCancelled = event.status === 'বাতিল';
      return (
        `${isCancelled ? '↩️' : '✅'} <b>উইথড্র ${escapeTelegramHtml(event.status || 'আপডেট')}</b>\n` +
        `👤 <b>ইউজার:</b> ${userName}${uidPart}\n` +
        `📲 <b>মাধ্যম:</b> ${escapeTelegramHtml(event.method || '')}\n` +
        `💸 <b>পরিমাণ:</b> ${formatTaka(event.amount)}${isCancelled ? ' (ওয়ালেটে রিফান্ড)' : ''}` +
        timePart
      );
    }
    case 'admin_adjust': {
      const delta = Number(event.delta ?? 0);
      const sign = delta >= 0 ? '+' : '-';
      const noteLine = event.note ? `\n📝 <b>কারণ:</b> ${escapeTelegramHtml(event.note)}` : '';
      return (
        `🛡️ <b>অ্যাডমিন ব্যালেন্স সমন্বয়</b>\n` +
        `👤 <b>ইউজার:</b> ${userName}${uidPart}\n` +
        `💰 <b>পরিবর্তন:</b> ${sign}${formatTaka(Math.abs(delta))}` +
        balancePart +
        noteLine +
        timePart
      );
    }
    case 'support_message': {
      const suspBadge = event.userSuspended ? '🚫 সাসপেন্ডেড অ্যাকাউন্ট' : '🟢 সচল অ্যাকাউন্ট';
      const normalized = (event.text || '').trim().replace(/\s+/g, ' ');
      const preview =
        normalized.length > 250 ? `${normalized.slice(0, 250)}…` : normalized;
      return (
        `💬 <b>নতুন লাইভ সাপোর্ট মেসেজ!</b>\n` +
        `👤 <b>ইউজার:</b> ${userName}${refPart}\n` +
        `🔖 <b>অবস্থা:</b> ${suspBadge}` +
        emailPart +
        uidPart +
        `\n📩 <b>মেসেজ প্রিভিউ:</b>\n<blockquote>${escapeTelegramHtml(preview)}</blockquote>` +
        timePart
      );
    }
  }
}

export async function sendTelegramNotification(
  event: TelegramNotificationPayload,
  options?: { botToken?: string; chatId?: string; fetchImpl?: typeof fetch }
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const botToken = (options?.botToken ?? process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  const chatId = (options?.chatId ?? process.env.TELEGRAM_CHAT_ID ?? '').trim();
  if (!botToken || !chatId) {
    return { ok: true, skipped: true };
  }

  const text = formatTelegramNotification(event);
  const fetchFn = options?.fetchImpl ?? fetch;

  try {
    const res = await fetchFn(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn(`Telegram notification rejected (${res.status}): ${detail.slice(0, 240)}`);
      return { ok: false, error: detail || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Telegram notification failed: ${msg}`);
    return { ok: false, error: msg };
  }
}
