export const SIGNUP_BONUS = 0;
export const REFERRAL_BONUS = 2;
export const FRIEND_REFERRAL_BONUS = 1;
export const REFERRAL_MIN_TASKS = 1;
export const MIN_WITHDRAW = 100;
export const STREAK_BONUS = [0.05, 0.1, 0.3, 0.5, 0.7, 0.9, 1] as const;

export const ADMIN_EMAILS = ['incomezone2729@gmail.com'] as const;

export type PaymentMethod = 'bKash' | 'Nagad' | 'Rocket';
export type WithdrawalFeeType = 'fixed' | 'percent';
export type WithdrawalStatus = 'প্রসেসিং' | 'সম্পন্ন' | 'বাতিল';
export type ThemeMode = 'dark' | 'light';

export interface WithdrawalSettingsConfig {
  feeType: WithdrawalFeeType;
  feeValue: number;
}

export const DEFAULT_WITHDRAWAL_SETTINGS: WithdrawalSettingsConfig = {
  feeType: 'fixed',
  feeValue: 0,
};

export const WITHDRAWAL_FEE_PRESETS: Record<WithdrawalFeeType, readonly number[]> = {
  fixed: [0, 5, 10, 15, 20, 30],
  percent: [0, 1, 2, 5, 10],
};

export interface ReferralSettingsConfig {
  referrerBonus: number;
  friendBonus: number;
  minTasks: number;
  conditionNote: string;
  referralDomain?: string;
}

export const DEFAULT_REFERRAL_SETTINGS: ReferralSettingsConfig = {
  referrerBonus: REFERRAL_BONUS,
  friendBonus: FRIEND_REFERRAL_BONUS,
  minTasks: REFERRAL_MIN_TASKS,
  conditionNote:
    'বন্ধুকে রেজিস্ট্রেশনের সময় আপনার রেফারেল কোড ব্যবহার করে ন্যূনতম দৈনিক চেক-ইন বা কাজ সম্পন্ন করতে হবে।',
  referralDomain: '',
};

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBn(value: number | string): string {
  return String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)] ?? d);
}

export function fmtAmount(value: number): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0.00';
  return num.toFixed(2);
}

export function fmtBnReward(value: number): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return '০';
  return Number.isInteger(num) ? toBn(num) : toBn(num.toFixed(2));
}

export function toPaisa(value: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100 + Math.sign(num) * 1e-9);
}

export function fromPaisa(paisa: number): number {
  const clean = Math.round(Number(paisa) || 0) / 100;
  return Object.is(clean, -0) ? 0 : clean;
}

export function addMoney(a: number, b: number): number {
  return fromPaisa(toPaisa(a) + toPaisa(b));
}

export function subtractMoney(a: number, b: number): number {
  return fromPaisa(toPaisa(a) - toPaisa(b));
}

export function roundMoney(value: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return fromPaisa(toPaisa(num));
}

export function computeNextWalletState(
  currentBalance: number,
  currentTotalEarned: number,
  delta: number
): { balance: number; totalEarned: number } {
  if (!Number.isFinite(currentBalance) || !Number.isFinite(currentTotalEarned) || !Number.isFinite(delta)) {
    throw new Error('অবৈধ ওয়ালেট সংখ্যা');
  }
  const balPaisa = toPaisa(currentBalance);
  const totalPaisa = toPaisa(currentTotalEarned);
  const deltaPaisa = toPaisa(delta);
  const nextBalPaisa = balPaisa + deltaPaisa;
  if (nextBalPaisa < 0) {
    throw new Error('ব্যালেন্স শূন্যের নিচে নামানো যাবে না');
  }
  const nextTotalPaisa = deltaPaisa > 0 ? totalPaisa + deltaPaisa : totalPaisa;
  return {
    balance: fromPaisa(nextBalPaisa),
    totalEarned: fromPaisa(nextTotalPaisa),
  };
}

export function computeRewardCreditState(
  currentBalance: number,
  currentTotalEarned: number,
  currentDailyTodayEarn: number,
  reward: number
): { balance: number; totalEarned: number; dailyTodayEarn: number } {
  const safeReward = roundMoney(reward);
  if (!Number.isFinite(safeReward) || safeReward <= 0) {
    throw new Error('অবৈধ পুরস্কারের পরিমাণ');
  }
  const safeBalance = Number(currentBalance ?? 0);
  const safeTotal = Number(currentTotalEarned ?? 0);
  const safeDaily = Number(currentDailyTodayEarn ?? 0);
  if (!Number.isFinite(safeBalance) || !Number.isFinite(safeTotal) || !Number.isFinite(safeDaily)) {
    throw new Error('অবৈধ ওয়ালেট সংখ্যা');
  }

  // Keep exact 2-decimal paisa arithmetic for normal balances, and preserve exact delta
  // if a legacy stored value contains >2 decimal places so Firestore rule delta checks match.
  const addPreservingLegacyPrecision = (base: number): number => {
    const roundedBase = roundMoney(base);
    if (Math.abs(base - roundedBase) < 0.0005) {
      return addMoney(roundedBase, safeReward);
    }
    return Number((base + safeReward).toFixed(4));
  };

  return {
    balance: addPreservingLegacyPrecision(safeBalance),
    totalEarned: addPreservingLegacyPrecision(safeTotal),
    dailyTodayEarn: addPreservingLegacyPrecision(safeDaily),
  };
}

export function formatAppErrorMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: unknown };
      if (typeof parsed.error === 'string' && parsed.error.trim()) {
        const inner = parsed.error.toLowerCase();
        if (inner.includes('permission') || inner.includes('insufficient')) {
          return 'অনুমতি বা তথ্য যাচাই ব্যর্থ হয়েছে, দয়া করে পুনরায় চেষ্টা করুন';
        }
        if (inner.includes('offline') || inner.includes('network') || inner.includes('unavailable')) {
          return 'ইন্টারনেট সংযোগে সমস্যা হয়েছে, অনুগ্রহ করে আবার চেষ্টা করুন';
        }
        return fallback;
      }
    } catch {
      // Ignore malformed JSON
    }
  }

  const lower = trimmed.toLowerCase();
  if (lower.includes('token expired') || lower.includes('authorization') || lower.includes('firebase token')) {
    return 'সেশন মেয়াদোত্তীর্ণ হয়েছে, দয়া করে আবার চেষ্টা করুন';
  }
  if (lower.includes('permission') || lower.includes('insufficient')) {
    return 'অনুমতি বা তথ্য যাচাই ব্যর্থ হয়েছে, দয়া করে পুনরায় চেষ্টা করুন';
  }
  if (
    lower.includes('unexpected end of json') ||
    lower.includes('unexpected token') ||
    lower.includes('is not valid json') ||
    lower.includes("failed to execute 'json'")
  ) {
    return 'সার্ভার থেকে অসম্পূর্ণ উত্তর এসেছে, অনুগ্রহ করে পুনরায় চেষ্টা করুন';
  }
  if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('offline')) {
    return 'ইন্টারনেট বা সার্ভার সংযোগ ব্যর্থ হয়েছে, আবার চেষ্টা করুন';
  }
  return trimmed;
}

export function todayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function yesterdayKey(date: Date = new Date()): string {
  const prev = new Date(date.getTime());
  prev.setDate(prev.getDate() - 1);
  return todayKey(prev);
}

export function formatBnDate(date: Date = new Date()): string {
  const months = ['জানু', 'ফেব', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্ট', 'অক্টো', 'নভে', 'ডিসে'];
  let h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${toBn(date.getDate())} ${months[date.getMonth()]}, ${toBn(h)}:${toBn(m)} ${ap}`;
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (ADMIN_EMAILS as readonly string[]).includes(normalized);
}

export const PUBLIC_APP_ORIGIN = 'https://takadear.onrender.com';

export function isTkdRefCode(refCode?: string | null): boolean {
  return /^TKD\d{4}$/.test((refCode || '').trim().toUpperCase());
}

export function extractUserIdFromRefCode(refCode?: string | null): string {
  const clean = (refCode || '').trim().toUpperCase();
  const match = clean.match(/^TKD(\d{4})$/);
  if (match) return match[1];
  return clean || '—';
}

export function generateRandomTkdRefCode(): string {
  const num = Math.floor(Math.random() * 10000);
  return `TKD${String(num).padStart(4, '0')}`;
}

export function generateRefCode(email: string, uid: string): string {
  const seed = `${uid.trim()}|${email.trim().toLowerCase()}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const digits = String((hash >>> 0) % 10000).padStart(4, '0');
  return `TKD${digits}`;
}

export function normalizeReferralDomain(domain?: string | null): string {
  const trimmed = (domain || '').trim();
  if (!trimmed) return '';
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.origin.replace(/\/+$/, '');
  } catch {
    return trimmed.replace(/\/+$/, '').slice(0, 200);
  }
}

export function buildReferralLink(
  refCode: string,
  referralDomain?: string | null,
  fallbackOrigin: string = PUBLIC_APP_ORIGIN
): string {
  const normalizedCustom = normalizeReferralDomain(referralDomain);
  const normalizedFallback = normalizeReferralDomain(fallbackOrigin) || PUBLIC_APP_ORIGIN;
  const cleanOrigin = normalizedCustom || normalizedFallback;
  const cleanCode = refCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
  return `${cleanOrigin}/register?ref=${encodeURIComponent(cleanCode)}`;
}

export function parseReferralEntryFromUrl(
  pathname: string,
  search: string
): { initialRefCode: string; defaultToSignup: boolean } {
  const params = new URLSearchParams(search || '');
  const rawRef = (params.get('ref') || '').trim().toUpperCase();
  const initialRefCode = rawRef.replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
  const cleanPath = (pathname || '/').replace(/\/+$/, '').toLowerCase();
  const defaultToSignup =
    Boolean(initialRefCode) || cleanPath === '/register' || cleanPath === '/signup';
  return { initialRefCode, defaultToSignup };
}

export function buildPasswordResetUrl(
  referralDomain?: string | null,
  fallbackOrigin: string = PUBLIC_APP_ORIGIN
): string {
  const normalizedCustom = normalizeReferralDomain(referralDomain);
  const normalizedFallback = normalizeReferralDomain(fallbackOrigin) || PUBLIC_APP_ORIGIN;
  const cleanOrigin = normalizedCustom || normalizedFallback;
  return `${cleanOrigin}/reset-password`;
}

export function parseAuthActionFromUrl(
  search: string
): { mode: 'resetPassword' | null; oobCode: string } {
  const params = new URLSearchParams(search || '');
  const mode = params.get('mode') === 'resetPassword' ? 'resetPassword' : null;
  const oobCode = (params.get('oobCode') || '').trim();
  if (mode !== 'resetPassword' || !oobCode) {
    return { mode: null, oobCode: '' };
  }
  return { mode: 'resetPassword', oobCode };
}

export function isPasswordResetReturnPath(pathname: string, search: string): boolean {
  const cleanPath = (pathname || '/').replace(/\/+$/, '').toLowerCase();
  return cleanPath === '/reset-password' && !parseAuthActionFromUrl(search).oobCode;
}

export function buildReferralShareMessage(
  refCode: string,
  referrerBonus: number,
  friendBonus: number,
  referralDomain?: string | null
): string {
  const link = buildReferralLink(refCode, referralDomain, PUBLIC_APP_ORIGIN);
  return (
    `টাকাডিয়ারে (TakaDear) যোগ দিন এবং আয় শুরু করুন! ` +
    `আমার রেফার লিংক থেকে রেজিস্ট্রেশন করলে আপনি ৳${fmtBnReward(friendBonus)} স্বাগত বোনাস পাবেন (আমিও পাব ৳${fmtBnReward(referrerBonus)})।\n` +
    `রেফার কোড: ${refCode.trim().toUpperCase()}\n` +
    `রেফার লিংক: ${link}`
  );
}

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'ইমেইল দিন';
  if (trimmed.length > 120) return 'ইমেইল সর্বোচ্চ ১২০ অক্ষর হতে পারে';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'সঠিক ইমেইল ঠিকানা দিন';
  return null;
}

export function validateUserName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2) return 'কমপক্ষে ২ অক্ষরের নাম লিখুন';
  if (trimmed.length > 80) return 'নাম সর্বোচ্চ ৮০ অক্ষর হতে পারে';
  return null;
}

export function validatePassword(pass: string): string | null {
  if (!pass || pass.length < 6) return 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে';
  if (pass.length > 128) return 'পাসওয়ার্ড সর্বোচ্চ ১২৮ অক্ষর হতে পারে';
  return null;
}

export function validateConfirmPassword(pass: string, confirmPass: string): string | null {
  if (!confirmPass) return 'কনফার্ম পাসওয়ার্ড দিন';
  if (pass !== confirmPass) return 'পাসওয়ার্ড এবং কনফার্ম পাসওয়ার্ড মিলছে না';
  return null;
}

export function deriveDisplayName(email: string, providedName?: string | null): string {
  const cleanProvided = (providedName || '').trim();
  if (cleanProvided.length >= 1) {
    return cleanProvided.slice(0, 80);
  }
  const localPart = email.trim().split('@')[0] || '';
  const cleaned = localPart
    .replace(/[._+\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length >= 1) {
    return cleaned.slice(0, 80);
  }
  return 'ব্যবহারকারী';
}

export function generateEasyPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  let partA = '';
  let partB = '';
  for (let i = 0; i < 4; i++) {
    partA += letters[Math.floor(Math.random() * letters.length)];
    partB += digits[Math.floor(Math.random() * digits.length)];
  }
  return `${partA}${partB}`;
}

export function validateBangladeshMobile(phone: string): boolean {
  return /^01[3-9]\d{8}$/.test(phone.trim());
}

export function calculateWithdrawalFee(
  amount: number,
  settings?: WithdrawalSettingsConfig | null
): number {
  const cleanAmount = roundMoney(amount);
  if (!Number.isFinite(amount) || cleanAmount <= 0 || !settings) return 0;
  const rawFee = Number(settings.feeValue ?? 0);
  if (!Number.isFinite(rawFee) || rawFee <= 0) return 0;
  if (settings.feeType === 'percent') {
    return roundMoney((cleanAmount * rawFee) / 100);
  }
  return roundMoney(rawFee);
}

export function calculateWithdrawalTotal(
  amount: number,
  settings?: WithdrawalSettingsConfig | null
): { payoutAmount: number; fee: number; totalDeducted: number } {
  const payoutAmount = roundMoney(amount);
  const fee = calculateWithdrawalFee(payoutAmount, settings);
  const totalDeducted = addMoney(payoutAmount, fee);
  return { payoutAmount, fee, totalDeducted };
}

export function validateWithdrawalSettings(settings: WithdrawalSettingsConfig): string | null {
  if (settings.feeType !== 'fixed' && settings.feeType !== 'percent') {
    return 'ফি এর ধরন সঠিক নয়';
  }
  const val = Number(settings.feeValue);
  if (!Number.isFinite(val) || val < 0) {
    return 'উইথড্র ফি শূন্য বা তার বেশি হতে হবে';
  }
  if (settings.feeType === 'fixed' && val > 1000) {
    return 'নির্দিষ্ট উইথড্র ফি সর্বোচ্চ ৳১,০০০ হতে পারে';
  }
  if (settings.feeType === 'percent' && val > 50) {
    return 'শতাংশ উইথড্র ফি সর্বোচ্চ ৫০% হতে পারে';
  }
  return null;
}

export function validateWithdrawal(
  phone: string,
  amount: number,
  currentBalance: number,
  fee = 0
): string | null {
  if (!validateBangladeshMobile(phone)) {
    return 'সঠিক ১১ সংখ্যার বিকাশ নম্বর দিন (01XXXXXXXXX)';
  }
  const cleanAmount = roundMoney(amount);
  const cleanFee = Math.max(0, roundMoney(fee));
  const totalDeducted = addMoney(cleanAmount, cleanFee);
  const cleanBalance = roundMoney(currentBalance);
  if (!Number.isFinite(amount) || cleanAmount < MIN_WITHDRAW) {
    return `সর্বনিম্ন উত্তোলন ৳${MIN_WITHDRAW}`;
  }
  if (cleanAmount > 100000 || totalDeducted > 150000) {
    return 'একবারে সর্বোচ্চ ৳১০০,০০০ উত্তোলন করা যাবে';
  }
  if (totalDeducted > cleanBalance) {
    return cleanFee > 0
      ? `আপনার পর্যাপ্ত ব্যালেন্স নেই (ফিসহ মোট ৳${fmtAmount(totalDeducted)} প্রয়োজন)`
      : 'আপনার পর্যাপ্ত ব্যালেন্স নেই';
  }
  return null;
}

export function maskPhoneNumber(phone: string): string {
  const clean = phone.trim();
  if (clean.length < 7) return '***';
  return `${clean.slice(0, 3)}****${clean.slice(-4)}`;
}

export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 1) return `***${trimmed.slice(Math.max(0, atIndex))}`;
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex);
  return `${local.slice(0, 2)}***${local.slice(-1)}${domain}`;
}

export function calculateUserLevel(totalEarned: number): number {
  return Math.floor(Math.max(0, totalEarned) / 200) + 1;
}

export function calculateNextStreak(
  lastCheckinDate: string | null,
  currentCount: number,
  today: string,
  yesterday: string
): { alreadyChecked: boolean; nextCount: number; reward: number } {
  if (lastCheckinDate === today) {
    return { alreadyChecked: true, nextCount: currentCount, reward: 0 };
  }
  const nextCount = lastCheckinDate === yesterday ? currentCount + 1 : 1;
  const reward = STREAK_BONUS[(nextCount - 1) % STREAK_BONUS.length];
  return { alreadyChecked: false, nextCount, reward };
}

export function getActiveStreakDisplay(
  lastCheckinDate: string | null,
  currentCount: number,
  today: string,
  yesterday: string
): { checkedToday: boolean; effectiveCount: number; completedInCycle: number; nextIndex: number } {
  if (lastCheckinDate === today) {
    const safeCount = Math.max(1, currentCount);
    return {
      checkedToday: true,
      effectiveCount: safeCount,
      completedInCycle: ((safeCount - 1) % STREAK_BONUS.length) + 1,
      nextIndex: -1,
    };
  }
  if (lastCheckinDate === yesterday && currentCount > 0) {
    return {
      checkedToday: false,
      effectiveCount: currentCount,
      completedInCycle: currentCount % STREAK_BONUS.length,
      nextIndex: currentCount % STREAK_BONUS.length,
    };
  }
  return {
    checkedToday: false,
    effectiveCount: 0,
    completedInCycle: 0,
    nextIndex: 0,
  };
}

export function normalizeDailyCounters<T extends {
  dailyDate: string;
  dailySpins: number;
  dailyAds: number;
  dailyTodayEarn: number;
  dailyTasks: Record<string, number>;
}>(account: T, today: string): T {
  if (account.dailyDate === today) {
    return account;
  }
  return {
    ...account,
    dailyDate: today,
    dailySpins: 0,
    dailyAds: 0,
    dailyTodayEarn: 0,
    dailyTasks: {},
  };
}

export function validateAdminBalanceDelta(currentBalance: number, delta: number): string | null {
  const cleanDelta = roundMoney(delta);
  if (!Number.isFinite(delta) || cleanDelta === 0) {
    return 'সঠিক টাকার পরিমাণ লিখুন (০ নয়)';
  }
  if (Math.abs(cleanDelta) > 100000) {
    return 'একবারে সর্বোচ্চ ±৳১০০,০০০ সমন্বয় করা যাবে';
  }
  if (toPaisa(currentBalance) + toPaisa(cleanDelta) < 0) {
    return 'ব্যবহারকারীর ব্যালেন্স শূন্যের নিচে নামানো যাবে না';
  }
  return null;
}

export function filterWithdrawalsByStatus<T extends { status: WithdrawalStatus }>(
  items: readonly T[],
  filter: 'all' | WithdrawalStatus
): T[] {
  if (filter === 'all') return [...items];
  return items.filter((item) => item.status === filter);
}

export function filterAdminTransactions<
  T extends { type: 'in' | 'out'; userName?: string; title: string; receiptId: string },
>(items: readonly T[], typeFilter: 'all' | 'in' | 'out', searchQuery: string): T[] {
  const q = searchQuery.trim().toLowerCase();
  return items.filter((item) => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false;
    if (!q) return true;
    return (
      (item.userName || '').toLowerCase().includes(q) ||
      item.title.toLowerCase().includes(q) ||
      item.receiptId.toLowerCase().includes(q)
    );
  });
}

export type AccountPlatform = 'gmail' | 'facebook';
export type AccountSubmissionStatus = 'পেন্ডিং' | 'এপ্রুভড' | 'রিজেক্টেড';

export interface AccountSellSettingsConfig {
  gmailEnabled: boolean;
  gmailPrice: number;
  gmailPassword: string;
  gmailNote: string;
  facebookEnabled: boolean;
  facebookPrice: number;
  facebookPassword: string;
  facebookNote: string;
}

export const DEFAULT_ACCOUNT_SELL_SETTINGS: AccountSellSettingsConfig = {
  gmailEnabled: true,
  gmailPrice: 15,
  gmailPassword: '',
  gmailNote: 'নতুন ফ্রেশ জিমেইল তৈরি করে অ্যাডমিনের দেওয়া পাসওয়ার্ড সেট করে সাবমিট করুন',
  facebookEnabled: true,
  facebookPrice: 25,
  facebookPassword: '',
  facebookNote: 'সক্রিয় ফেসবুক আইডি ও নির্ধারিত পাসওয়ার্ড সাবমিট করুন',
};

export function maskAccountIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  if (trimmed.includes('@')) return maskEmail(trimmed);
  if (validateBangladeshMobile(trimmed)) return maskPhoneNumber(trimmed);
  if (trimmed.length <= 5) return '***';
  return `${trimmed.slice(0, 3)}***${trimmed.slice(-2)}`;
}

export function validateAccountSubmissionInput(
  platform: AccountPlatform,
  identifier: string,
  password: string
): string | null {
  const cleanId = identifier.trim();
  const cleanPass = password.trim();
  if (platform === 'gmail') {
    const emailErr = validateEmail(cleanId);
    if (emailErr) return 'সঠিক জিমেইল ঠিকানা লিখুন';
  } else {
    if (cleanId.length < 4) return 'সঠিক ফেসবুক আইডি, মোবাইল নম্বর বা ইমেইল লিখুন';
    if (cleanId.length > 120) return 'আইডি সর্বোচ্চ ১২০ অক্ষর হতে পারে';
  }
  if (cleanPass.length < 6) return 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে';
  if (cleanPass.length > 120) return 'পাসওয়ার্ড সর্বোচ্চ ১২০ অক্ষরের হতে পারে';
  return null;
}

export function validateTaskSellSettings(settings: AccountSellSettingsConfig): string | null {
  if (!Number.isFinite(settings.gmailPrice) || settings.gmailPrice < 1 || settings.gmailPrice > 100000) {
    return 'জিমেইল সেলের দাম ১৳ থেকে ১,০০,০০০৳ এর মধ্যে হতে হবে';
  }
  if (!Number.isFinite(settings.facebookPrice) || settings.facebookPrice < 1 || settings.facebookPrice > 100000) {
    return 'ফেসবুক সেলের দাম ১৳ থেকে ১,০০,০০০৳ এর মধ্যে হতে হবে';
  }
  if (settings.gmailPassword.length > 120 || settings.facebookPassword.length > 120) {
    return 'পাসওয়ার্ড সর্বোচ্চ ১২০ অক্ষরের হতে পারে';
  }
  if (settings.gmailNote.length > 240 || settings.facebookNote.length > 240) {
    return 'নির্দেশনা সর্বোচ্চ ২৪০ অক্ষরের হতে পারে';
  }
  return null;
}

export function filterAccountSubmissionsByStatus<T extends { status: AccountSubmissionStatus }>(
  items: readonly T[],
  filter: 'all' | AccountSubmissionStatus
): T[] {
  if (filter === 'all') return [...items];
  return items.filter((item) => item.status === filter);
}

export function filterAccountSubmissionsByPlatform<T extends { platform: AccountPlatform }>(
  items: readonly T[],
  platform: AccountPlatform
): T[] {
  return items.filter((item) => item.platform === platform);
}

export function validateSupportMessageText(text: string): string | null {
  const clean = text.trim();
  if (!clean) return 'মেসেজ লিখুন';
  if (clean.length > 1000) return 'মেসেজ সর্বোচ্চ ১,০০০ অক্ষরের হতে পারে';
  return null;
}

export function sortSupportThreads<T extends { unreadByAdmin: number; updatedAtMs: number }>(
  threads: readonly T[]
): T[] {
  return [...threads].sort((a, b) => {
    const aUnread = a.unreadByAdmin > 0 ? 1 : 0;
    const bUnread = b.unreadByAdmin > 0 ? 1 : 0;
    if (aUnread !== bUnread) return bUnread - aUnread;
    return b.updatedAtMs - a.updatedAtMs;
  });
}

export function filterUsersByStatusAndQuery<
  T extends {
    name: string;
    refCode: string;
    uid: string;
    email?: string | null;
    emailMasked?: string | null;
    suspended?: boolean;
  },
>(
  users: readonly T[],
  statusFilter: 'all' | 'active' | 'suspended',
  searchQuery: string
): T[] {
  const q = searchQuery.trim().toLowerCase();
  return users.filter((u) => {
    const isSusp = Boolean(u.suspended);
    if (statusFilter === 'active' && isSusp) return false;
    if (statusFilter === 'suspended' && !isSusp) return false;
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.refCode.toLowerCase().includes(q) ||
      u.uid.toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.emailMasked || '').toLowerCase().includes(q)
    );
  });
}

export function validateReferralSettings(settings: ReferralSettingsConfig): string | null {
  if (!Number.isFinite(settings.referrerBonus) || settings.referrerBonus < 0.5 || settings.referrerBonus > 100) {
    return 'আমন্ত্রণকারী বোনাস ০.৫০৳ থেকে ১০০৳ এর মধ্যে হতে হবে';
  }
  if (!Number.isFinite(settings.friendBonus) || settings.friendBonus < 0 || settings.friendBonus > 100) {
    return 'বন্ধু বোনাস ০৳ থেকে ১০০৳ এর মধ্যে হতে হবে';
  }
  if (!Number.isInteger(settings.minTasks) || settings.minTasks < 0 || settings.minTasks > 10) {
    return 'ন্যূনতম শর্ত ০ থেকে ১০ এর মধ্যে পূর্ণসংখ্যা হতে হবে';
  }
  if ((settings.conditionNote || '').trim().length > 300) {
    return 'শর্তের বিবরণ সর্বোচ্চ ৩০০ অক্ষরের হতে পারে';
  }
  const domain = (settings.referralDomain || '').trim();
  if (domain.length > 200) {
    return 'রেফারেল ডোমেইন সর্বোচ্চ ২০০ অক্ষরের হতে পারে';
  }
  if (domain) {
    const withProtocol = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
    try {
      const parsed = new URL(withProtocol);
      if (!parsed.hostname || (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost')) {
        return 'সঠিক রেফারেল ডোমেইন দিন (যেমন: https://takadear.onrender.com)';
      }
    } catch {
      return 'সঠিক রেফারেল ডোমেইন দিন (যেমন: https://takadear.onrender.com)';
    }
  }
  return null;
}

export function countCompletedActivities(account: {
  streakCount?: number;
  dailySpins?: number;
  dailyTasks?: Record<string, number>;
}): number {
  const streak = Math.max(0, Number(account.streakCount || 0));
  const spins = Math.max(0, Number(account.dailySpins || 0));
  const tasksTotal = Object.values(account.dailyTasks || {}).reduce(
    (sum, val) => sum + Math.max(0, Number(val) || 0),
    0
  );
  return streak + spins + tasksTotal;
}

export function isReferralQualified(completedCount: number, minTasks: number): boolean {
  if (!Number.isFinite(minTasks) || minTasks <= 0) return true;
  return completedCount >= minTasks;
}

export const USER_ACCOUNT_REQUIRED_KEYS = [
  'uid',
  'name',
  'refCode',
  'balance',
  'totalEarned',
  'referrals',
  'refEarned',
  'streakCount',
  'dailyDate',
  'dailySpins',
  'dailyAds',
  'dailyTodayEarn',
  'dailyTasks',
  'theme',
  'role',
  'createdAt',
  'updatedAt',
] as const;

export const USER_ACCOUNT_ALLOWED_KEYS = [
  ...USER_ACCOUNT_REQUIRED_KEYS,
  'referredBy',
  'streakLast',
  'suspended',
  'suspensionReason',
  'suspendedAt',
  'lastSpinAt',
  'lastBigSpinAt',
] as const;

export interface LegacyUserRepairPlan {
  needsRepair: boolean;
  keysToDelete: string[];
  patch: Record<string, unknown>;
  needsCreatedAt: boolean;
}

function isTimestampLike(value: unknown): boolean {
  return (
    value !== undefined &&
    value !== null &&
    typeof value === 'object' &&
    ('seconds' in (value as Record<string, unknown>) ||
      'toMillis' in (value as Record<string, unknown>))
  );
}

export function analyzeLegacyUserAccount(
  raw: Record<string, unknown>,
  uid: string,
  email: string,
  today: string,
  fallbackDisplayName?: string
): LegacyUserRepairPlan {
  const allowedSet = new Set<string>(USER_ACCOUNT_ALLOWED_KEYS);
  const keysToDelete = Object.keys(raw).filter((k) => !allowedSet.has(k));
  const patch: Record<string, unknown> = {};

  if (typeof raw.uid !== 'string' || raw.uid !== uid) {
    patch.uid = uid;
  }
  if (typeof raw.name !== 'string' || raw.name.trim().length < 1 || raw.name.length > 80) {
    patch.name = deriveDisplayName(email, fallbackDisplayName);
  }
  if (
    typeof raw.refCode !== 'string' ||
    raw.refCode.length < 4 ||
    raw.refCode.length > 24 ||
    !/^[A-Z0-9_\-]+$/.test(raw.refCode)
  ) {
    patch.refCode = generateRefCode(email, uid);
  }
  if (
    'referredBy' in raw &&
    raw.referredBy !== null &&
    (typeof raw.referredBy !== 'string' || raw.referredBy.length > 24)
  ) {
    patch.referredBy = null;
  }
  if (typeof raw.balance !== 'number' || !Number.isFinite(raw.balance) || raw.balance < 0 || raw.balance > 10000000) {
    patch.balance = 0;
  }
  if (
    typeof raw.totalEarned !== 'number' ||
    !Number.isFinite(raw.totalEarned) ||
    raw.totalEarned < 0 ||
    raw.totalEarned > 10000000
  ) {
    patch.totalEarned = 0;
  }
  if (!Number.isInteger(raw.referrals) || Number(raw.referrals) < 0 || Number(raw.referrals) > 100000) {
    patch.referrals = 0;
  }
  if (
    typeof raw.refEarned !== 'number' ||
    !Number.isFinite(raw.refEarned) ||
    raw.refEarned < 0 ||
    raw.refEarned > 10000000
  ) {
    patch.refEarned = 0;
  }
  if (!Number.isInteger(raw.streakCount) || Number(raw.streakCount) < 0 || Number(raw.streakCount) > 10000) {
    patch.streakCount = 0;
  }
  if (
    'streakLast' in raw &&
    raw.streakLast !== null &&
    (typeof raw.streakLast !== 'string' || raw.streakLast.length > 16)
  ) {
    patch.streakLast = null;
  }

  const validDailyDate =
    typeof raw.dailyDate === 'string' && raw.dailyDate.length >= 8 && raw.dailyDate.length <= 16;
  if (!validDailyDate) {
    patch.dailyDate = today;
  }
  if (!Number.isInteger(raw.dailySpins) || Number(raw.dailySpins) < 0 || Number(raw.dailySpins) > 20) {
    patch.dailySpins = 0;
  }
  if (!Number.isInteger(raw.dailyAds) || Number(raw.dailyAds) < 0 || Number(raw.dailyAds) > 200) {
    patch.dailyAds = 0;
  }
  if (
    typeof raw.dailyTodayEarn !== 'number' ||
    !Number.isFinite(raw.dailyTodayEarn) ||
    raw.dailyTodayEarn < 0 ||
    raw.dailyTodayEarn > 100000
  ) {
    patch.dailyTodayEarn = 0;
  }
  if (
    !raw.dailyTasks ||
    typeof raw.dailyTasks !== 'object' ||
    Array.isArray(raw.dailyTasks) ||
    Object.keys(raw.dailyTasks as Record<string, unknown>).length > 20
  ) {
    patch.dailyTasks = {};
  }
  if (raw.theme !== 'dark' && raw.theme !== 'light') {
    patch.theme = 'dark';
  }
  if (raw.role !== 'user' && raw.role !== 'admin') {
    patch.role = 'user';
  } else if (raw.role === 'admin' && !isAdminEmail(email)) {
    patch.role = 'user';
  }
  if ('suspended' in raw && typeof raw.suspended !== 'boolean') {
    patch.suspended = false;
  }
  if (
    'suspensionReason' in raw &&
    raw.suspensionReason !== null &&
    (typeof raw.suspensionReason !== 'string' || raw.suspensionReason.length > 240)
  ) {
    patch.suspensionReason = null;
  }
  if ('suspendedAt' in raw && raw.suspendedAt !== null && !isTimestampLike(raw.suspendedAt)) {
    patch.suspendedAt = null;
  }
  if ('lastSpinAt' in raw && raw.lastSpinAt !== null && !isTimestampLike(raw.lastSpinAt)) {
    patch.lastSpinAt = null;
  }
  if ('lastBigSpinAt' in raw && raw.lastBigSpinAt !== null && !isTimestampLike(raw.lastBigSpinAt)) {
    patch.lastBigSpinAt = null;
  }

  const needsCreatedAt = !isTimestampLike(raw.createdAt);
  const needsUpdatedAt = !isTimestampLike(raw.updatedAt);
  const needsRepair =
    keysToDelete.length > 0 ||
    Object.keys(patch).length > 0 ||
    needsCreatedAt ||
    needsUpdatedAt;

  return {
    needsRepair,
    keysToDelete,
    patch,
    needsCreatedAt,
  };
}

