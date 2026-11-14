export const SIGNUP_BONUS = 0;
export const REFERRAL_BONUS = 2;
export const FRIEND_REFERRAL_BONUS = 1;
export const REFERRAL_MIN_TASKS = 1;
export const MIN_WITHDRAW = 100;
export const SPIN_LIMIT = 5;
export const AD_LIMIT = 20;
export const STREAK_BONUS = [0.05, 0.1, 0.3, 0.5, 0.7, 0.9, 1] as const;

export const ADMIN_EMAILS = ['incomezone2729@gmail.com'] as const;

export type PaymentMethod = 'bKash' | 'Nagad' | 'Rocket';
export type WithdrawalStatus = 'প্রসেসিং' | 'সম্পন্ন' | 'বাতিল';
export type ThemeMode = 'dark' | 'light';

export interface WheelSegment {
  v: number;
  c: string;
}

export const WHEEL_SEGMENTS: readonly WheelSegment[] = [
  { v: 0.1, c: '#6c5ce7' },
  { v: 0.5, c: '#00d68f' },
  { v: 0.2, c: '#f7b731' },
  { v: 1, c: '#ff5c7a' },
  { v: 0.1, c: '#6c5ce7' },
  { v: 1.5, c: '#00d68f' },
  { v: 0.5, c: '#f7b731' },
  { v: 2, c: '#ff5c7a' },
];

export type ControllableTaskId = 'ad' | 'article' | 'quiz' | 'survey' | 'app';
export type TaskId = ControllableTaskId | 'invite';

export interface TaskConfig {
  id: TaskId;
  icon: string;
  title: string;
  desc: string;
  reward: number;
  limit: number;
  timer: number;
}

export interface MergedTaskConfig extends TaskConfig {
  enabled: boolean;
  url: string;
}

export interface RegularTaskConfigItem {
  enabled: boolean;
  limit: number;
  reward: number;
  timer: number;
  url: string;
}

export type RegularTaskSettingsMap = Record<ControllableTaskId, RegularTaskConfigItem>;

export const CONTROLLABLE_TASK_IDS: readonly ControllableTaskId[] = [
  'ad',
  'article',
  'quiz',
  'survey',
  'app',
];

export const DEFAULT_REGULAR_TASK_SETTINGS: RegularTaskSettingsMap = {
  ad: { enabled: true, limit: AD_LIMIT, reward: 0.5, timer: 30, url: '' },
  article: { enabled: true, limit: 5, reward: 0.5, timer: 15, url: '' },
  quiz: { enabled: true, limit: 1, reward: 0.5, timer: 0, url: '' },
  survey: { enabled: true, limit: 2, reward: 0.5, timer: 0, url: '' },
  app: { enabled: true, limit: 3, reward: 0.5, timer: 20, url: '' },
};

export const TASKS: readonly TaskConfig[] = [
  { id: 'ad', icon: '📺', title: 'বিজ্ঞাপন দেখুন', desc: '৩০ সেকেন্ডের ভিডিও', reward: 0.5, limit: AD_LIMIT, timer: 30 },
  { id: 'article', icon: '📖', title: 'আর্টিকেল পড়ুন', desc: '১৫ সেকেন্ড', reward: 0.5, limit: 5, timer: 15 },
  { id: 'quiz', icon: '🧠', title: 'দৈনিক কুইজ', desc: 'সঠিক উত্তরে পুরস্কার', reward: 0.5, limit: 1, timer: 0 },
  { id: 'survey', icon: '📋', title: 'সংক্ষিপ্ত সার্ভে', desc: '২টি প্রশ্ন', reward: 0.5, limit: 2, timer: 0 },
  { id: 'app', icon: '📱', title: 'অ্যাপ ইনস্টল', desc: 'স্পনসর অ্যাপ', reward: 0.5, limit: 3, timer: 20 },
  { id: 'invite', icon: '🤝', title: 'বন্ধু আমন্ত্রণ', desc: 'রেফার কোড ও শর্তাবলি', reward: REFERRAL_BONUS, limit: 99, timer: 0 },
];

export interface ReferralSettingsConfig {
  referrerBonus: number;
  friendBonus: number;
  minTasks: number;
  conditionNote: string;
}

export const DEFAULT_REFERRAL_SETTINGS: ReferralSettingsConfig = {
  referrerBonus: REFERRAL_BONUS,
  friendBonus: FRIEND_REFERRAL_BONUS,
  minTasks: REFERRAL_MIN_TASKS,
  conditionNote:
    'বন্ধুকে রেজিস্ট্রেশনের সময় আপনার রেফারেল কোড ব্যবহার করে ন্যূনতম কাজ সম্পন্ন করতে হবে।',
};

export interface QuizQuestion {
  q: string;
  opts: readonly string[];
  ans: number;
}

export const QUIZ_DATA: readonly QuizQuestion[] = [
  { q: 'বাংলাদেশের রাজধানী?', opts: ['ঢাকা', 'চট্টগ্রাম', 'খুলনা', 'সিলেট'], ans: 0 },
  { q: 'জাতীয় ফুল?', opts: ['গোলাপ', 'শাপলা', 'জবা', 'পদ্ম'], ans: 1 },
  { q: 'এক বছরে কত মাস?', opts: ['১০', '১১', '১২', '১৩'], ans: 2 },
  { q: 'মুদ্রার নাম?', opts: ['রুপি', 'টাকা', 'ডলার', 'রিয়াল'], ans: 1 },
  { q: 'সূর্য কোন দিকে ওঠে?', opts: ['পশ্চিম', 'উত্তর', 'দক্ষিণ', 'পূর্ব'], ans: 3 },
];

export interface SurveyQuestion {
  q: string;
  opts: readonly string[];
}

export const SURVEY_DATA: readonly SurveyQuestion[] = [
  { q: 'আপনার বয়স?', opts: ['১৮-২৪', '২৫-৩৪', '৩৫-৪৪', '৪৫+'] },
  { q: 'দৈনিক ফোন ব্যবহার?', opts: ['১ ঘণ্টার কম', '১-৩ ঘণ্টা', '৩-৬ ঘণ্টা', '৬+ ঘণ্টা'] },
];

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

export function generateRefCode(email: string, uid: string): string {
  const cleanPrefix = email.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  const cleanUid = uid.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase().padStart(4, '0');
  return `TK${cleanPrefix}${cleanUid}`;
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

export function validateRefCode(code: string): boolean {
  return /^[A-Z0-9_-]{4,24}$/.test(code.trim().toUpperCase());
}

export function validateBangladeshMobile(phone: string): boolean {
  return /^01[3-9]\d{8}$/.test(phone.trim());
}

export function validateWithdrawal(
  phone: string,
  amount: number,
  currentBalance: number
): string | null {
  if (!validateBangladeshMobile(phone)) {
    return 'সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন (01XXXXXXXXX)';
  }
  const cleanAmount = roundMoney(amount);
  const cleanBalance = roundMoney(currentBalance);
  if (!Number.isFinite(amount) || cleanAmount < MIN_WITHDRAW) {
    return `সর্বনিম্ন উত্তোলন ৳${MIN_WITHDRAW}`;
  }
  if (cleanAmount > 100000) {
    return 'একবারে সর্বোচ্চ ৳১০০,০০০ উত্তোলন করা যাবে';
  }
  if (cleanAmount > cleanBalance) {
    return 'আপনার পর্যাপ্ত ব্যালেন্স নেই';
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

export function computeSpinRotation(currentRotation: number, segmentIndex: number): number {
  const segAngle = 360 / WHEEL_SEGMENTS.length;
  const targetAngle = (360 - (segmentIndex * segAngle + segAngle / 2)) % 360;
  const curMod = ((currentRotation % 360) + 360) % 360;
  let delta = targetAngle - curMod;
  if (delta < 0) delta += 360;
  return currentRotation + 360 * 6 + delta;
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

export function validateTaskUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.length > 500) return 'লিংক সর্বোচ্চ ৫০০ অক্ষরের হতে পারে';
  if (/\s/.test(trimmed)) return 'লিংকের ভেতর কোনো স্পেস থাকতে পারবে না';
  if (!/^https?:\/\/[^\s]+$/i.test(trimmed)) {
    return 'সঠিক লিংক দিন (http:// বা https:// দিয়ে শুরু)';
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'শুধুমাত্র http:// বা https:// লিংক অনুমোদিত';
    }
  } catch {
    return 'সঠিক ও বৈধ URL লিংক দিন';
  }
  return null;
}

export function validateRegularTaskSettings(settings: RegularTaskSettingsMap): string | null {
  for (const id of CONTROLLABLE_TASK_IDS) {
    const item = settings[id];
    const meta = TASKS.find((t) => t.id === id);
    const label = meta?.title || id;

    if (!item || typeof item.enabled !== 'boolean') {
      return `${label}: চালু/বন্ধ অবস্থা সঠিক নয়`;
    }
    if (!Number.isInteger(item.limit) || item.limit < 0 || item.limit > 200) {
      return `${label}: দৈনিক লিমিট ০ থেকে ২০০ এর মধ্যে পূর্ণসংখ্যা হতে হবে`;
    }
    if (!Number.isFinite(item.reward) || item.reward < 0.05 || item.reward > 500) {
      return `${label}: পুরস্কারের পরিমাণ ০.০৫৳ থেকে ৫০০৳ এর মধ্যে হতে হবে`;
    }
    if (!Number.isInteger(item.timer) || item.timer < 0 || item.timer > 300) {
      return `${label}: সময় ০ থেকে ৩০০ সেকেন্ডের মধ্যে পূর্ণসংখ্যা হতে হবে`;
    }
    const urlErr = validateTaskUrl(item.url);
    if (urlErr) {
      return `${label}: ${urlErr}`;
    }
  }
  return null;
}

export function buildMergedTasks(
  settings: RegularTaskSettingsMap,
  referralSettings?: ReferralSettingsConfig
): MergedTaskConfig[] {
  return TASKS.map((base) => {
    if (base.id === 'invite') {
      return {
        ...base,
        reward: roundMoney(referralSettings?.referrerBonus ?? REFERRAL_BONUS),
        enabled: true,
        url: '',
      };
    }
    const override = settings[base.id] || DEFAULT_REGULAR_TASK_SETTINGS[base.id];
    const timer = Number.isInteger(override.timer) && override.timer >= 0 ? override.timer : base.timer;
    const url = (override.url || '').trim();
    const reward = roundMoney(override.reward);
    const limit = Math.max(0, Math.min(200, Math.round(override.limit)));
    let desc = base.desc;
    if (url) {
      desc = timer > 0 ? `লিংক ভিজিট · ${toBn(timer)} সেকেন্ড` : 'লিংক ভিজিট করে আয়';
    } else if (timer > 0 && (base.id === 'ad' || base.id === 'article' || base.id === 'app')) {
      desc = `${toBn(timer)} সেকেন্ডের টাস্ক`;
    }

    return {
      ...base,
      desc,
      reward: reward >= 0.05 ? reward : base.reward,
      limit,
      timer,
      enabled: Boolean(override.enabled),
      url,
    };
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
    return 'ন্যূনতম টাস্কের শর্ত ০ থেকে ১০ এর মধ্যে পূর্ণসংখ্যা হতে হবে';
  }
  if ((settings.conditionNote || '').trim().length > 300) {
    return 'শর্তের বিবরণ সর্বোচ্চ ৩০০ অক্ষরের হতে পারে';
  }
  return null;
}

export function countCompletedActivities(account: {
  dailySpins?: number;
  dailyTasks?: Record<string, number>;
}): number {
  const spins = Math.max(0, Number(account.dailySpins || 0));
  const tasksTotal = Object.values(account.dailyTasks || {}).reduce(
    (sum, val) => sum + Math.max(0, Number(val) || 0),
    0
  );
  return spins + tasksTotal;
}

export function isReferralQualified(completedCount: number, minTasks: number): boolean {
  if (!Number.isFinite(minTasks) || minTasks <= 0) return true;
  return completedCount >= minTasks;
}

export function calculateRemainingSeconds(
  startedAtMs: number,
  durationSeconds: number,
  nowMs: number = Date.now()
): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  const remainingMs = durationSeconds * 1000 - elapsedMs;
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / 1000);
}
