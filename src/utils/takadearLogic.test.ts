import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMoney,
  analyzeLegacyUserAccount,
  calculateNextStreak,
  calculateUserLevel,
  calculateWithdrawalFee,
  calculateWithdrawalTotal,
  computeNextWalletState,
  computeRewardCreditState,
  countCompletedActivities,
  DEFAULT_REFERRAL_SETTINGS,
  DEFAULT_WITHDRAWAL_SETTINGS,
  deriveDisplayName,
  filterAccountSubmissionsByPlatform,
  filterAccountSubmissionsByStatus,
  filterAdminTransactions,
  filterUsersByStatusAndQuery,
  filterWithdrawalsByStatus,
  fmtAmount,
  fmtBnReward,
  formatAppErrorMessage,
  FRIEND_REFERRAL_BONUS,
  fromPaisa,
  generateEasyPassword,
  generateRefCode,
  getActiveStreakDisplay,
  isAdminEmail,
  isReferralQualified,
  maskAccountIdentifier,
  maskEmail,
  maskPhoneNumber,
  normalizeDailyCounters,
  REFERRAL_BONUS,
  REFERRAL_MIN_TASKS,
  roundMoney,
  SIGNUP_BONUS,
  sortSupportThreads,
  STREAK_BONUS,
  subtractMoney,
  toBn,
  toPaisa,
  validateAccountSubmissionInput,
  validateAdminBalanceDelta,
  validateBangladeshMobile,
  validateConfirmPassword,
  validateEmail,
  validateReferralSettings,
  validateSupportMessageText,
  validateTaskSellSettings,
  validateUserName,
  validateWithdrawal,
  validateWithdrawalSettings,
  WITHDRAWAL_FEE_PRESETS,
} from './takadearLogic';
import {
  decryptSensitiveData,
  encryptSensitiveData,
  signTransactionPayload,
  verifyTransactionSignature,
} from '../server/crypto';
import {
  getCalibratedNowSec,
  parseHttpDateMs,
  TOKEN_CLOCK_LEEWAY_SEC,
  validateDecodedFirebaseClaims,
} from '../server/firebaseAuthVerify';

test('Bengali numeral formatting and amount formatting', () => {
  assert.equal(toBn(1250), '১২৫০');
  assert.equal(fmtAmount(50), '50.00');
  assert.equal(fmtAmount(12.5), '12.50');
  assert.equal(fmtBnReward(0.5), '০.৫০');
  assert.equal(fmtBnReward(0.1), '০.১০');
  assert.equal(fmtBnReward(1.5), '১.৫০');
  assert.equal(fmtBnReward(2), '২');
});

test('Referral code generation and exclusive admin email checks', () => {
  assert.equal(generateRefCode('rahim@gmail.com', 'abc123xyz9'), 'TKRAHXYZ9');
  assert.equal(isAdminEmail('incomezone2729@gmail.com'), true);
  assert.equal(isAdminEmail('INCOMEZONE2729@GMAIL.COM'), true);
  assert.equal(isAdminEmail('ahtaskpay@gmail.com'), false);
  assert.equal(isAdminEmail('attacker@gmail.com'), false);
});

test('Signup and referral reward bounds', () => {
  assert.equal(SIGNUP_BONUS, 0);
  assert.equal(REFERRAL_BONUS, 2);
});

test('Phone, email, and withdrawal validation', () => {
  assert.equal(validateEmail('user@example.com'), null);
  assert.notEqual(validateEmail('bad-email'), null);
  assert.equal(validateBangladeshMobile('01712345678'), true);
  assert.equal(validateBangladeshMobile('01212345678'), false);
  assert.equal(validateWithdrawal('01712345678', 100, 150), null);
  assert.notEqual(validateWithdrawal('01712345678', 50, 150), null);
  assert.notEqual(validateWithdrawal('01712345678', 200, 150), null);
});

test('bKash withdrawal fee calculation, total deduction, and admin fee settings validation', () => {
  assert.deepEqual(DEFAULT_WITHDRAWAL_SETTINGS, { feeType: 'fixed', feeValue: 0 });
  assert.deepEqual([...WITHDRAWAL_FEE_PRESETS.fixed], [0, 5, 10, 15, 20, 30]);
  assert.deepEqual([...WITHDRAWAL_FEE_PRESETS.percent], [0, 1, 2, 5, 10]);

  assert.equal(calculateWithdrawalFee(100, DEFAULT_WITHDRAWAL_SETTINGS), 0);
  assert.deepEqual(calculateWithdrawalTotal(200, { feeType: 'fixed', feeValue: 15 }), {
    payoutAmount: 200,
    fee: 15,
    totalDeducted: 215,
  });
  assert.deepEqual(calculateWithdrawalTotal(250, { feeType: 'percent', feeValue: 2 }), {
    payoutAmount: 250,
    fee: 5,
    totalDeducted: 255,
  });
  assert.deepEqual(calculateWithdrawalTotal(101, { feeType: 'percent', feeValue: 2.5 }), {
    payoutAmount: 101,
    fee: 2.53,
    totalDeducted: 103.53,
  });

  // Fee added to withdrawal amount checks balance against amount + fee
  assert.equal(validateWithdrawal('01712345678', 100, 110, 10), null);
  const insufficientErr = validateWithdrawal('01712345678', 100, 105, 10);
  assert.ok(insufficientErr && insufficientErr.includes('110.00'));

  assert.equal(validateWithdrawalSettings({ feeType: 'fixed', feeValue: 0 }), null);
  assert.equal(validateWithdrawalSettings({ feeType: 'fixed', feeValue: 1000 }), null);
  assert.notEqual(validateWithdrawalSettings({ feeType: 'fixed', feeValue: -1 }), null);
  assert.notEqual(validateWithdrawalSettings({ feeType: 'fixed', feeValue: 1001 }), null);
  assert.equal(validateWithdrawalSettings({ feeType: 'percent', feeValue: 50 }), null);
  assert.notEqual(validateWithdrawalSettings({ feeType: 'percent', feeValue: 55 }), null);
});

test('PII masking utilities hide sensitive middle digits', () => {
  assert.equal(maskPhoneNumber('01712345678'), '017****5678');
  assert.equal(maskEmail('incomezone2729@gmail.com'), 'in***9@gmail.com');
});

test('Daily check-in streak progressive Day 1-7 rewards, miss reset, and display state', () => {
  assert.deepEqual([...STREAK_BONUS], [0.05, 0.1, 0.3, 0.5, 0.7, 0.9, 1]);
  assert.equal(roundMoney(0.1 + 0.2), 0.3);

  const day1 = calculateNextStreak(null, 0, '2026-11-12', '2026-11-11');
  assert.deepEqual(day1, { alreadyChecked: false, nextCount: 1, reward: 0.05 });

  const day2 = calculateNextStreak('2026-11-11', 1, '2026-11-12', '2026-11-11');
  assert.deepEqual(day2, { alreadyChecked: false, nextCount: 2, reward: 0.1 });

  const day3 = calculateNextStreak('2026-11-11', 2, '2026-11-12', '2026-11-11');
  assert.deepEqual(day3, { alreadyChecked: false, nextCount: 3, reward: 0.3 });

  const day4 = calculateNextStreak('2026-11-11', 3, '2026-11-12', '2026-11-11');
  assert.deepEqual(day4, { alreadyChecked: false, nextCount: 4, reward: 0.5 });

  const day5 = calculateNextStreak('2026-11-11', 4, '2026-11-12', '2026-11-11');
  assert.deepEqual(day5, { alreadyChecked: false, nextCount: 5, reward: 0.7 });

  const day6 = calculateNextStreak('2026-11-11', 5, '2026-11-12', '2026-11-11');
  assert.deepEqual(day6, { alreadyChecked: false, nextCount: 6, reward: 0.9 });

  const day7 = calculateNextStreak('2026-11-11', 6, '2026-11-12', '2026-11-11');
  assert.deepEqual(day7, { alreadyChecked: false, nextCount: 7, reward: 1 });

  // Missing a day resets streak back to Day 1 (0.05)
  const missedDay = calculateNextStreak('2026-11-09', 5, '2026-11-12', '2026-11-11');
  assert.deepEqual(missedDay, { alreadyChecked: false, nextCount: 1, reward: 0.05 });

  const sameDay = calculateNextStreak('2026-11-12', 1, '2026-11-12', '2026-11-11');
  assert.deepEqual(sameDay, { alreadyChecked: true, nextCount: 1, reward: 0 });

  // Display state checks
  assert.deepEqual(getActiveStreakDisplay('2026-11-09', 5, '2026-11-12', '2026-11-11'), {
    checkedToday: false,
    effectiveCount: 0,
    completedInCycle: 0,
    nextIndex: 0,
  });
  assert.deepEqual(getActiveStreakDisplay('2026-11-11', 3, '2026-11-12', '2026-11-11'), {
    checkedToday: false,
    effectiveCount: 3,
    completedInCycle: 3,
    nextIndex: 3,
  });
  assert.deepEqual(getActiveStreakDisplay('2026-11-12', 7, '2026-11-12', '2026-11-11'), {
    checkedToday: true,
    effectiveCount: 7,
    completedInCycle: 7,
    nextIndex: -1,
  });

  const reset = normalizeDailyCounters(
    { dailyDate: '2026-11-11', dailySpins: 5, dailyAds: 10, dailyTodayEarn: 40, dailyTasks: { ad: 10 } },
    '2026-11-12'
  );
  assert.equal(reset.dailySpins, 0);
  assert.equal(reset.dailyAds, 0);
  assert.equal(reset.dailyTodayEarn, 0);
  assert.deepEqual(reset.dailyTasks, {});
});

test('User level calculation', () => {
  assert.equal(calculateUserLevel(0), 1);
  assert.equal(calculateUserLevel(250), 2);
});

test('AES-256-GCM encryption roundtrip and tamper rejection', () => {
  const secretWallet = '01712345678';
  const encrypted = encryptSensitiveData(secretWallet);
  assert.equal(encrypted.algorithm, 'AES-256-GCM');
  assert.ok(!encrypted.packed.includes(secretWallet));
  assert.equal(decryptSensitiveData(encrypted.packed), secretWallet);

  const tampered = encrypted.packed.slice(0, -4) + 'AAAA';
  assert.throws(() => decryptSensitiveData(tampered));
});

test('HMAC-SHA256 transaction receipt signing and verification', () => {
  const payload = { uid: 'user1', action: 'task', amount: 10 };
  const signed = signTransactionPayload(payload);
  assert.equal(
    verifyTransactionSignature(payload, signed.receiptId, signed.verifiedAt, signed.receiptSignature),
    true
  );
  assert.equal(
    verifyTransactionSignature({ ...payload, amount: 1000 }, signed.receiptId, signed.verifiedAt, signed.receiptSignature),
    false
  );
});

test('Admin balance validation and list filtering helpers', () => {
  assert.equal(validateAdminBalanceDelta(200, 50), null);
  assert.equal(validateAdminBalanceDelta(200, -200), null);
  assert.notEqual(validateAdminBalanceDelta(200, 0), null);
  assert.notEqual(validateAdminBalanceDelta(200, -250), null);
  assert.notEqual(validateAdminBalanceDelta(200, 200000), null);

  const withdrawals = [
    { id: '1', status: 'প্রসেসিং' as const },
    { id: '2', status: 'সম্পন্ন' as const },
    { id: '3', status: 'বাতিল' as const },
  ];
  assert.equal(filterWithdrawalsByStatus(withdrawals, 'all').length, 3);
  assert.deepEqual(filterWithdrawalsByStatus(withdrawals, 'প্রসেসিং').map((w) => w.id), ['1']);
  assert.deepEqual(filterWithdrawalsByStatus(withdrawals, 'বাতিল').map((w) => w.id), ['3']);

  const txs = [
    { type: 'in' as const, userName: 'রহিম', title: 'দৈনিক চেক-ইন', receiptId: 'RC-101' },
    { type: 'out' as const, userName: 'করিম', title: 'bKash উত্তোলন', receiptId: 'RC-202' },
  ];
  assert.equal(filterAdminTransactions(txs, 'all', '').length, 2);
  assert.equal(filterAdminTransactions(txs, 'in', '').length, 1);
  assert.equal(filterAdminTransactions(txs, 'out', 'RC-202').length, 1);
  assert.equal(filterAdminTransactions(txs, 'out', 'রহিম').length, 0);
});

test('Gmail and Facebook sell validation, masking, and submission filtering', () => {
  assert.equal(validateAccountSubmissionInput('gmail', 'fresh@gmail.com', 'Pass1234'), null);
  assert.notEqual(validateAccountSubmissionInput('gmail', 'not-an-email', 'Pass1234'), null);
  assert.notEqual(validateAccountSubmissionInput('gmail', 'fresh@gmail.com', '123'), null);

  assert.equal(validateAccountSubmissionInput('facebook', '01712345678', 'FbPass12'), null);
  assert.notEqual(validateAccountSubmissionInput('facebook', 'ab', 'FbPass12'), null);

  assert.equal(maskAccountIdentifier('freshuser@gmail.com'), 'fr***r@gmail.com');
  assert.equal(maskAccountIdentifier('01712345678'), '017****5678');
  assert.equal(maskAccountIdentifier('fb.user.99'), 'fb.***99');

  assert.equal(
    validateTaskSellSettings({
      gmailEnabled: true,
      gmailPrice: 15,
      gmailPassword: 'Pass@123',
      gmailNote: 'note',
      facebookEnabled: true,
      facebookPrice: 25,
      facebookPassword: 'Fb@123',
      facebookNote: 'note',
    }),
    null
  );
  assert.notEqual(
    validateTaskSellSettings({
      gmailEnabled: true,
      gmailPrice: 0,
      gmailPassword: 'Pass@123',
      gmailNote: '',
      facebookEnabled: true,
      facebookPrice: 25,
      facebookPassword: '',
      facebookNote: '',
    }),
    null
  );

  const subs = [
    { id: 's1', status: 'পেন্ডিং' as const, platform: 'gmail' as const },
    { id: 's2', status: 'এপ্রুভড' as const, platform: 'facebook' as const },
    { id: 's3', status: 'রিজেক্টেড' as const, platform: 'gmail' as const },
  ];
  assert.equal(filterAccountSubmissionsByStatus(subs, 'all').length, 3);
  assert.deepEqual(filterAccountSubmissionsByStatus(subs, 'পেন্ডিং').map((s) => s.id), ['s1']);
  assert.deepEqual(filterAccountSubmissionsByStatus(subs, 'এপ্রুভড').map((s) => s.id), ['s2']);

  assert.deepEqual(filterAccountSubmissionsByPlatform(subs, 'gmail').map((s) => s.id), ['s1', 's3']);
  assert.deepEqual(filterAccountSubmissionsByPlatform(subs, 'facebook').map((s) => s.id), ['s2']);
  assert.deepEqual(filterAccountSubmissionsByPlatform([], 'gmail'), []);
});

test('Live support message validation, thread sorting, and user suspension filtering', () => {
  assert.notEqual(validateSupportMessageText('   '), null);
  assert.equal(validateSupportMessageText('আমার অ্যাকাউন্ট আনব্লক করুন'), null);
  assert.notEqual(validateSupportMessageText('a'.repeat(1001)), null);

  const threads = [
    { id: 't1', unreadByAdmin: 0, updatedAtMs: 5000 },
    { id: 't2', unreadByAdmin: 2, updatedAtMs: 2000 },
    { id: 't3', unreadByAdmin: 1, updatedAtMs: 4000 },
    { id: 't4', unreadByAdmin: 0, updatedAtMs: 8000 },
  ];
  assert.deepEqual(
    sortSupportThreads(threads).map((t) => t.id),
    ['t3', 't2', 't4', 't1']
  );

  const users = [
    {
      uid: 'u1',
      name: 'রহিম',
      refCode: 'TKRAH1111',
      email: 'rahim.ahmed@gmail.com',
      emailMasked: 'ra***d@gmail.com',
      suspended: false,
    },
    {
      uid: 'u2',
      name: 'করিম',
      refCode: 'TKKAR2222',
      email: 'karim.bd@yahoo.com',
      emailMasked: 'ka***d@yahoo.com',
      suspended: true,
    },
    {
      uid: 'u3',
      name: 'সালমা',
      refCode: 'TKSAL3333',
      emailMasked: 'sa***a@gmail.com',
    },
  ];
  assert.equal(filterUsersByStatusAndQuery(users, 'all', '').length, 3);
  assert.deepEqual(filterUsersByStatusAndQuery(users, 'suspended', '').map((u) => u.uid), ['u2']);
  assert.deepEqual(filterUsersByStatusAndQuery(users, 'active', '').map((u) => u.uid), ['u1', 'u3']);
  assert.deepEqual(filterUsersByStatusAndQuery(users, 'suspended', 'করিম').map((u) => u.uid), ['u2']);
  assert.deepEqual(filterUsersByStatusAndQuery(users, 'suspended', 'রহিম'), []);
  assert.deepEqual(filterUsersByStatusAndQuery(users, 'all', 'rahim.ahmed@gmail.com').map((u) => u.uid), ['u1']);
  assert.deepEqual(filterUsersByStatusAndQuery(users, 'all', 'KARIM.BD@YAHOO.COM').map((u) => u.uid), ['u2']);
  assert.deepEqual(filterUsersByStatusAndQuery(users, 'all', 'sa***a@gmail.com').map((u) => u.uid), ['u3']);
});

test('Quick signup display name derivation and easy password generation', () => {
  assert.equal(deriveDisplayName('rahim.khan@gmail.com', 'রহিম উদ্দিন'), 'রহিম উদ্দিন');
  assert.equal(deriveDisplayName('rahim.khan_99@gmail.com', ''), 'rahim khan 99');
  assert.equal(deriveDisplayName('@gmail.com', '  '), 'ব্যবহারকারী');
  assert.ok(deriveDisplayName('a'.repeat(100) + '@gmail.com').length <= 80);

  const generated = generateEasyPassword();
  assert.equal(generated.length, 8);
  assert.match(generated, /^[a-z0-9]{8}$/);
});

test('Registration name and confirm password validation', () => {
  assert.notEqual(validateUserName(''), null);
  assert.notEqual(validateUserName('ক'), null);
  assert.equal(validateUserName('রহিম উদ্দিন'), null);

  assert.notEqual(validateConfirmPassword('secret12', ''), null);
  assert.notEqual(validateConfirmPassword('secret12', 'secret99'), null);
  assert.equal(validateConfirmPassword('secret12', 'secret12'), null);
});

test('Wallet balance arithmetic remains exact without floating-point glitches', () => {
  assert.equal(toPaisa(0.05), 5);
  assert.equal(toPaisa(0.1), 10);
  assert.equal(toPaisa(19.99), 1999);
  assert.equal(fromPaisa(355), 3.55);
  assert.equal(addMoney(0.1, 0.2), 0.3);
  assert.equal(subtractMoney(100.3, 100), 0.3);

  let wallet = computeNextWalletState(0, 0, 0);
  for (const r of STREAK_BONUS) {
    wallet = computeNextWalletState(wallet.balance, wallet.totalEarned, r);
  }
  assert.equal(wallet.balance, 3.55);
  assert.equal(wallet.totalEarned, 3.55);

  // 200 sequential small earnings of 0.05 and 0.15 must stay exact to the paisa
  let many = computeNextWalletState(0, 0, 0);
  for (let i = 0; i < 100; i++) {
    many = computeNextWalletState(many.balance, many.totalEarned, 0.05);
    many = computeNextWalletState(many.balance, many.totalEarned, 0.15);
  }
  assert.equal(many.balance, 20);
  assert.equal(many.totalEarned, 20);

  // Midnight daily counter rollover must preserve exact balance & totalEarned untouched
  const beforeRollover = {
    balance: many.balance,
    totalEarned: many.totalEarned,
    dailyDate: '2026-11-11',
    dailySpins: 5,
    dailyAds: 20,
    dailyTodayEarn: 20,
    dailyTasks: { ad: 20 },
  };
  const rolled = normalizeDailyCounters(beforeRollover, '2026-11-12');
  assert.equal(rolled.balance, 20);
  assert.equal(rolled.totalEarned, 20);
  assert.equal(rolled.dailyTodayEarn, 0);

  const afterWithdraw = computeNextWalletState(100.3, 100.3, -100);
  assert.equal(afterWithdraw.balance, 0.3);
  assert.equal(afterWithdraw.totalEarned, 100.3);

  assert.throws(() => computeNextWalletState(50, 50, -51));
  assert.throws(() => computeNextWalletState(NaN, 0, 1));
  assert.throws(() => computeNextWalletState(10, 10, Infinity));
  assert.equal(roundMoney(-0), 0);
  assert.equal(Object.is(roundMoney(-0), -0), false);
});

test('Referral bonus configuration, condition validation, and qualification counters', () => {
  assert.equal(REFERRAL_BONUS, 2);
  assert.equal(FRIEND_REFERRAL_BONUS, 1);
  assert.equal(REFERRAL_MIN_TASKS, 1);
  assert.equal(validateReferralSettings(DEFAULT_REFERRAL_SETTINGS), null);

  assert.notEqual(
    validateReferralSettings({ ...DEFAULT_REFERRAL_SETTINGS, referrerBonus: 0.2 }),
    null
  );
  assert.notEqual(
    validateReferralSettings({ ...DEFAULT_REFERRAL_SETTINGS, friendBonus: -1 }),
    null
  );
  assert.notEqual(
    validateReferralSettings({ ...DEFAULT_REFERRAL_SETTINGS, minTasks: 15 }),
    null
  );

  assert.equal(countCompletedActivities({ streakCount: 0, dailySpins: 0, dailyTasks: {} }), 0);
  assert.equal(countCompletedActivities({ streakCount: 1, dailySpins: 0, dailyTasks: {} }), 1);
  assert.equal(countCompletedActivities({ streakCount: 1, dailySpins: 2, dailyTasks: { ad: 3, quiz: 1 } }), 7);
  assert.equal(isReferralQualified(0, 1), false);
  assert.equal(isReferralQualified(1, 1), true);
  assert.equal(isReferralQualified(0, 0), true);
});

test('Legacy user schema analyzer detects extra legacy fields, missing counters, and role normalization', () => {
  const validDoc = {
    uid: '6CMVTWvMxrNybyqG7PeBoQG7bNz2',
    name: 'Test User',
    refCode: 'TKAHTBNZ2',
    referredBy: null,
    balance: 12.5,
    totalEarned: 12.5,
    referrals: 1,
    refEarned: 2,
    streakCount: 1,
    streakLast: '2026-11-14',
    dailyDate: '2026-11-14',
    dailySpins: 0,
    dailyAds: 0,
    dailyTodayEarn: 0.05,
    dailyTasks: {},
    theme: 'dark',
    role: 'user',
    createdAt: { seconds: 1700000000, nanoseconds: 0 },
    updatedAt: { seconds: 1700000000, nanoseconds: 0 },
  };
  const cleanPlan = analyzeLegacyUserAccount(
    validDoc,
    '6CMVTWvMxrNybyqG7PeBoQG7bNz2',
    'ahtaskpay@gmail.com',
    '2026-11-14'
  );
  assert.equal(cleanPlan.needsRepair, false);
  assert.deepEqual(cleanPlan.keysToDelete, []);
  assert.deepEqual(cleanPlan.patch, {});

  const legacyDoc = {
    uid: '6CMVTWvMxrNybyqG7PeBoQG7bNz2',
    name: 'AH Task',
    email: 'ahtaskpay@gmail.com',
    refCode: 'TKAHTBNZ2',
    balance: 50,
    totalEarned: 50,
    referrals: 0,
    refEarned: 0,
    streakCount: 0,
    dailyDate: '2026-11-14',
    dailySpins: 0,
    dailyAds: 0,
    theme: 'dark',
    role: 'admin',
    suspended: null,
    lastSpinAt: 'bad-string-ts',
    lastBigSpinAt: 12345,
    createdAt: { seconds: 1700000000, nanoseconds: 0 },
    updatedAt: { seconds: 1700000000, nanoseconds: 0 },
  };
  const repairPlan = analyzeLegacyUserAccount(
    legacyDoc,
    '6CMVTWvMxrNybyqG7PeBoQG7bNz2',
    'ahtaskpay@gmail.com',
    '2026-11-14'
  );
  assert.equal(repairPlan.needsRepair, true);
  assert.deepEqual(repairPlan.keysToDelete, ['email']);
  assert.equal(repairPlan.patch.dailyTodayEarn, 0);
  assert.deepEqual(repairPlan.patch.dailyTasks, {});
  assert.equal(repairPlan.patch.role, 'user');
  assert.equal(repairPlan.patch.suspended, false);
  assert.equal(repairPlan.patch.lastSpinAt, null);
  assert.equal(repairPlan.patch.lastBigSpinAt, null);
  assert.equal('balance' in repairPlan.patch, false);

  const validWithSpinTs = {
    ...validDoc,
    lastSpinAt: { seconds: 1700000100, nanoseconds: 0 },
    lastBigSpinAt: { seconds: 1700000000, nanoseconds: 0 },
  };
  const spinTsPlan = analyzeLegacyUserAccount(
    validWithSpinTs,
    '6CMVTWvMxrNybyqG7PeBoQG7bNz2',
    'ahtaskpay@gmail.com',
    '2026-11-14'
  );
  assert.equal(spinTsPlan.needsRepair, false);
});

test('computeRewardCreditState handles exact paisa math and preserves >2-decimal legacy deltas', () => {
  const normal = computeRewardCreditState(10.1, 10.1, 0.2, 0.5);
  assert.deepEqual(normal, {
    balance: 10.6,
    totalEarned: 10.6,
    dailyTodayEarn: 0.7,
  });

  // Legacy doc with 3 decimal digits: delta must stay exact (0.5) without rounding the base off
  const legacy = computeRewardCreditState(12.345, 22.345, 1.005, 0.5);
  assert.equal(legacy.balance, 12.845);
  assert.equal(legacy.totalEarned, 22.845);
  assert.equal(legacy.dailyTodayEarn, 1.505);
  assert.ok(Math.abs((legacy.balance - 12.345) - 0.5) < 0.0001);

  // IEEE-754 boundary cases (e.g., 0.47 + 2 === 2.4699999999999998 < 2.47) stay within 0.001 rule ULP epsilon
  for (const [base, reward, expected] of [
    [0.47, 2, 2.47],
    [0.36, 1, 1.36],
    [0.72, 2, 2.72],
    [0.18, 0.5, 0.68],
  ] as const) {
    const res = computeRewardCreditState(base, base, 0, reward);
    assert.equal(res.balance, expected);
    assert.equal(res.totalEarned, expected);
    assert.equal(res.dailyTodayEarn, reward);
    assert.ok(res.balance <= base + reward + 0.001);
  }

  assert.throws(() => computeRewardCreditState(10, 10, 0, 0));
  assert.throws(() => computeRewardCreditState(10, 10, 0, -1));
  assert.throws(() => computeRewardCreditState(NaN, 10, 0, 0.5));
});

test('formatAppErrorMessage translates JSON Firestore, network, and token errors cleanly', () => {
  const fallback = 'কাজ সম্পন্ন করতে সমস্যা হয়েছে';
  assert.equal(formatAppErrorMessage(new Error(''), fallback), fallback);

  const permissionJson = JSON.stringify({
    error: 'Missing or insufficient permissions.',
    operationType: 'write',
    path: 'users/123',
  });
  const formattedPerm = formatAppErrorMessage(new Error(permissionJson), fallback);
  assert.ok(formattedPerm.includes('অনুমতি বা তথ্য যাচাই ব্যর্থ হয়েছে'));
  assert.equal(formattedPerm.includes('{'), false);

  const offlineJson = JSON.stringify({ error: 'Failed to get document because the client is offline.' });
  assert.ok(formatAppErrorMessage(new Error(offlineJson), fallback).includes('ইন্টারনেট সংযোগে'));

  assert.ok(formatAppErrorMessage(new Error('Token expired'), fallback).includes('সেশন মেয়াদোত্তীর্ণ'));
  assert.ok(formatAppErrorMessage(new Error('Failed to fetch'), fallback).includes('সার্ভার সংযোগ ব্যর্থ'));
  assert.equal(formatAppErrorMessage(new Error('আজকের লিমিট শেষ!'), fallback), 'আজকের লিমিট শেষ!');
});

test('Firebase JWT claim validation and Google HTTP Date clock-skew calibration', () => {
  const serverMs = parseHttpDateMs('Mon, 17 Nov 2026 00:38:56 GMT');
  assert.ok(serverMs !== null);
  assert.equal(parseHttpDateMs('invalid-date'), null);

  // Simulate container clock running 56s fast ahead of Google UTC
  const skewedLocalMs = serverMs + 56_000;
  const offsetMs = serverMs - skewedLocalMs; // -56_000
  const calibratedSec = getCalibratedNowSec(skewedLocalMs, offsetMs);
  assert.equal(calibratedSec, Math.floor(serverMs / 1000));

  const projectId = 'takadear-1e124';
  const validClaims = {
    iss: `https://securetoken.google.com/${projectId}`,
    aud: projectId,
    sub: 'user-uid-123',
    iat: calibratedSec - 10,
    exp: calibratedSec + 3590,
  };
  assert.doesNotThrow(() => validateDecodedFirebaseClaims(validClaims, projectId, calibratedSec));

  // Token within leeway window still passes; past leeway fails
  assert.doesNotThrow(() =>
    validateDecodedFirebaseClaims(
      { ...validClaims, exp: calibratedSec - (TOKEN_CLOCK_LEEWAY_SEC - 5) },
      projectId,
      calibratedSec
    )
  );
  assert.throws(
    () =>
      validateDecodedFirebaseClaims(
        { ...validClaims, exp: calibratedSec - TOKEN_CLOCK_LEEWAY_SEC },
        projectId,
        calibratedSec
      ),
    /Token expired/
  );

  assert.throws(
    () => validateDecodedFirebaseClaims({ ...validClaims, iat: calibratedSec + 301 }, projectId, calibratedSec),
    /Invalid token issued-at time/
  );
  assert.throws(
    () => validateDecodedFirebaseClaims({ ...validClaims, iss: 'https://evil.example.com' }, projectId, calibratedSec),
    /Invalid token issuer/
  );
  assert.throws(
    () => validateDecodedFirebaseClaims({ ...validClaims, aud: 'wrong-project' }, projectId, calibratedSec),
    /Invalid token audience/
  );
  assert.throws(
    () => validateDecodedFirebaseClaims({ ...validClaims, sub: '' }, projectId, calibratedSec),
    /Invalid token subject/
  );
});


