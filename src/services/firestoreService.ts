import type { User } from 'firebase/auth';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  addMoney,
  analyzeLegacyUserAccount,
  calculateNextStreak,
  calculateWithdrawalTotal,
  computeNextWalletState,
  computeRewardCreditState,
  countCompletedActivities,
  DEFAULT_ACCOUNT_SELL_SETTINGS,
  DEFAULT_REFERRAL_SETTINGS,
  DEFAULT_WITHDRAWAL_SETTINGS,
  deriveDisplayName,
  fmtAmount,
  formatBnDate,
  generateRefCode,
  isReferralQualified,
  maskAccountIdentifier,
  maskEmail,
  normalizeDailyCounters,
  REFERRAL_BONUS,
  roundMoney,
  sortSupportThreads,
  todayKey,
  validateWithdrawal,
  yesterdayKey,
  type AccountPlatform,
  type AccountSellSettingsConfig,
  type AccountSubmissionStatus,
  type PaymentMethod,
  type ReferralSettingsConfig,
  type ThemeMode,
  type WithdrawalSettingsConfig,
  type WithdrawalStatus,
} from '../utils/takadearLogic';
import {
  decryptBatchOnServer,
  decryptFieldOnServer,
  encryptFieldOnServer,
  notifyTelegramEvent,
  signRewardReceipt,
} from './secureApi';

export interface UserAccount {
  uid: string;
  name: string;
  refCode: string;
  referredBy: string | null;
  balance: number;
  totalEarned: number;
  referrals: number;
  refEarned: number;
  streakCount: number;
  streakLast: string | null;
  dailyDate: string;
  dailySpins: number;
  dailyAds: number;
  dailyTodayEarn: number;
  dailyTasks: Record<string, number>;
  theme: ThemeMode;
  role: 'user' | 'admin';
  suspended?: boolean;
  suspensionReason?: string | null;
  suspendedAt?: Timestamp | null;
  lastSpinAt?: Timestamp | null;
  lastBigSpinAt?: Timestamp | null;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  // Runtime-hydrated display fields for verified Admin Dashboard only (stored isolated in private/vault)
  email?: string | null;
  emailMasked?: string | null;
}

export interface UserPrivateVault {
  userId: string;
  emailMasked: string;
  encryptedEmail: string;
  encryptedPhone?: string | null;
  encryptionAlgorithm: 'AES-256-GCM';
  keyVersion: string;
}

export interface TransactionRecord {
  id: string;
  userId: string;
  type: 'in' | 'out';
  amount: number;
  title: string;
  icon: string;
  receiptId: string;
  receiptSignature: string;
  createdAtMs: number;
  dateLabel: string;
}

export interface WithdrawalRecord {
  id: string;
  userId: string;
  userName: string;
  method: PaymentMethod;
  maskedNumber: string;
  encryptedAccount: string;
  amount: number;
  fee?: number;
  totalAmount?: number;
  status: WithdrawalStatus;
  receiptId: string;
  receiptSignature: string;
  createdAtMs: number;
  dateLabel: string;
}

export interface AccountSubmissionRecord {
  id: string;
  userId: string;
  userName: string;
  platform: AccountPlatform;
  maskedIdentifier: string;
  encryptedCredentials: string;
  amount: number;
  status: AccountSubmissionStatus;
  adminNote: string | null;
  receiptId: string;
  receiptSignature: string;
  createdAtMs: number;
  dateLabel: string;
}

export interface SupportThreadRecord {
  id: string;
  userId: string;
  userName: string;
  userRefCode: string;
  userSuspended: boolean;
  lastMessage: string;
  lastSender: 'user' | 'admin';
  unreadByAdmin: number;
  unreadByUser: number;
  updatedAtMs: number;
  dateLabel: string;
}

export interface SupportMessageRecord {
  id: string;
  threadId: string;
  senderId: string;
  senderRole: 'user' | 'admin';
  senderName: string;
  text: string;
  createdAtMs: number;
  dateLabel: string;
}

function makeDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function timestampToMs(ts: unknown): number {
  if (ts && typeof ts === 'object' && 'toMillis' in ts && typeof (ts as Timestamp).toMillis === 'function') {
    return (ts as Timestamp).toMillis();
  }
  return Date.now();
}

const walletQueues = new Map<string, Promise<unknown>>();

function enqueueWalletOp<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  const prev = walletQueues.get(uid) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  const marker = next.catch(() => undefined);
  walletQueues.set(uid, marker);
  marker.finally(() => {
    if (walletQueues.get(uid) === marker) {
      walletQueues.delete(uid);
    }
  });
  return next;
}

async function getUserDocPreferServer(
  userRef: ReturnType<typeof doc>,
  options?: { allowEmptyCache?: boolean }
) {
  try {
    return await getDocFromServer(userRef);
  } catch (err) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'permission-denied') {
      throw err;
    }
    const cached = await getDoc(userRef);
    if (cached.exists() || options?.allowEmptyCache) {
      return cached;
    }
    throw err;
  }
}

export async function fetchUserAccountSnapshot(uid: string): Promise<UserAccount | null> {
  try {
    const snap = await getUserDocPreferServer(doc(db, 'users', uid), { allowEmptyCache: true });
    return snap.exists() ? (snap.data() as UserAccount) : null;
  } catch {
    return null;
  }
}

function isFirestoreSdkTimestamp(value: unknown): boolean {
  return (
    value instanceof Timestamp ||
    (value !== null &&
      typeof value === 'object' &&
      typeof (value as { toMillis?: unknown }).toMillis === 'function')
  );
}

function sanitizeRawTimestampsForRepair(raw: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...raw };
  for (const key of ['createdAt', 'updatedAt', 'lastSpinAt', 'lastBigSpinAt', 'suspendedAt'] as const) {
    const val = copy[key];
    if (val !== undefined && val !== null && !isFirestoreSdkTimestamp(val)) {
      copy[key] = '__invalid_non_timestamp__';
    }
  }
  return copy;
}

function isPermissionDeniedError(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  if (code === 'permission-denied') return true;
  const msg = err instanceof Error ? err.message : String(err || '');
  return msg.toLowerCase().includes('missing or insufficient permissions');
}

function logUserRuleDiagnostic(
  action: string,
  uid: string,
  raw: Record<string, unknown> | null,
  extra?: Record<string, unknown>
): void {
  try {
    const keys = raw ? Object.keys(raw).sort() : [];
    console.error('[FirestoreRuleDiagnostic]', {
      action,
      uid,
      keys,
      role: raw?.role ?? null,
      suspended: raw?.suspended ?? null,
      balanceType: raw ? typeof raw.balance : null,
      totalEarnedType: raw ? typeof raw.totalEarned : null,
      referralsInt: raw ? Number.isInteger(raw.referrals) : null,
      streakInt: raw ? Number.isInteger(raw.streakCount) : null,
      dailySpinsInt: raw ? Number.isInteger(raw.dailySpins) : null,
      dailyAdsInt: raw ? Number.isInteger(raw.dailyAds) : null,
      dailyTodayEarnType: raw ? typeof raw.dailyTodayEarn : null,
      createdAtValidTs: raw ? isFirestoreSdkTimestamp(raw.createdAt) : false,
      updatedAtValidTs: raw ? isFirestoreSdkTimestamp(raw.updatedAt) : false,
      lastSpinAtNullOrTs: raw ? raw.lastSpinAt == null || isFirestoreSdkTimestamp(raw.lastSpinAt) : true,
      lastBigSpinAtNullOrTs: raw
        ? raw.lastBigSpinAt == null || isFirestoreSdkTimestamp(raw.lastBigSpinAt)
        : true,
      ...(extra || {}),
    });
  } catch {
    // Non-fatal diagnostic logger
  }
}

async function repairLegacyUserDocIfNeeded(
  userRef: ReturnType<typeof doc>,
  uid: string,
  email: string,
  today: string,
  fallbackDisplayName?: string
): Promise<UserAccount | null> {
  const snap = await getUserDocPreferServer(userRef);
  if (!snap.exists()) return null;
  const raw = snap.data() as Record<string, unknown>;
  if (raw.suspended === true) {
    return raw as unknown as UserAccount;
  }

  const repairPlan = analyzeLegacyUserAccount(
    sanitizeRawTimestampsForRepair(raw),
    uid,
    email,
    today,
    fallbackDisplayName
  );
  if (!repairPlan.needsRepair) {
    return raw as unknown as UserAccount;
  }

  let repairedAccount = raw as unknown as UserAccount;
  try {
    await runTransaction(db, async (tx) => {
      const latestSnap = await tx.get(userRef);
      if (!latestSnap.exists()) return;
      const latestRaw = latestSnap.data() as Record<string, unknown>;
      if (latestRaw.suspended === true) {
        repairedAccount = latestRaw as unknown as UserAccount;
        return;
      }
      const livePlan = analyzeLegacyUserAccount(
        sanitizeRawTimestampsForRepair(latestRaw),
        uid,
        email,
        today,
        fallbackDisplayName
      );
      if (!livePlan.needsRepair) {
        repairedAccount = latestRaw as unknown as UserAccount;
        return;
      }
      const updatePayload: Record<string, unknown> = {
        ...livePlan.patch,
        referrals: Math.trunc(
          Number(
            'referrals' in livePlan.patch
              ? livePlan.patch.referrals
              : Number.isInteger(latestRaw.referrals)
                ? latestRaw.referrals
                : 0
          )
        ),
        streakCount: Math.trunc(
          Number(
            'streakCount' in livePlan.patch
              ? livePlan.patch.streakCount
              : Number.isInteger(latestRaw.streakCount)
                ? latestRaw.streakCount
                : 0
          )
        ),
        dailySpins: Math.trunc(
          Number(
            'dailySpins' in livePlan.patch
              ? livePlan.patch.dailySpins
              : Number.isInteger(latestRaw.dailySpins)
                ? latestRaw.dailySpins
                : 0
          )
        ),
        dailyAds: Math.trunc(
          Number(
            'dailyAds' in livePlan.patch
              ? livePlan.patch.dailyAds
              : Number.isInteger(latestRaw.dailyAds)
                ? latestRaw.dailyAds
                : 0
          )
        ),
        updatedAt: serverTimestamp(),
      };
      if (livePlan.needsCreatedAt) {
        updatePayload.createdAt = serverTimestamp();
      }
      for (const delKey of livePlan.keysToDelete) {
        updatePayload[delKey] = deleteField();
      }
      tx.update(userRef, updatePayload);
    });
  } catch (err) {
    if (isPermissionDeniedError(err)) {
      logUserRuleDiagnostic('repairLegacyUserDocIfNeeded', uid, raw, {
        repairKeys: Object.keys(repairPlan.patch),
        keysToDelete: repairPlan.keysToDelete,
        needsCreatedAt: repairPlan.needsCreatedAt,
      });
    }
    throw err;
  }

  const refreshedSnap = await getUserDocPreferServer(userRef);
  if (refreshedSnap.exists()) {
    repairedAccount = refreshedSnap.data() as UserAccount;
  }
  return repairedAccount;
}

export async function ensureUserAccount(
  user: User,
  options?: { displayName?: string; referredBy?: string }
): Promise<{ account: UserAccount; vault: UserPrivateVault | null; isNewUser: boolean; bonusAwarded: number }> {
  return enqueueWalletOp(user.uid, async () => {
    const userRef = doc(db, 'users', user.uid);
    const vaultRef = doc(db, 'users', user.uid, 'private', 'vault');
    let snap;
    try {
      snap = await getUserDocPreferServer(userRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
    }

    const today = todayKey();
    const resolvedEmail = user.email || `${user.uid}@takadear.app`;
    const fallbackName = options?.displayName || user.displayName || undefined;

    if (snap.exists()) {
      let currentAccount = snap.data() as UserAccount;

      try {
        const repaired = await repairLegacyUserDocIfNeeded(
          userRef,
          user.uid,
          resolvedEmail,
          today,
          fallbackName
        );
        if (repaired) {
          currentAccount = repaired;
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
      }

      if (currentAccount.dailyDate !== today) {
        try {
          await runTransaction(db, async (tx) => {
            const latestSnap = await tx.get(userRef);
            if (!latestSnap.exists()) return;
            const latest = latestSnap.data() as UserAccount;
            if (latest.dailyDate === today) {
              currentAccount = latest;
              return;
            }
            tx.update(userRef, {
              dailyDate: today,
              dailySpins: 0,
              dailyAds: 0,
              dailyTodayEarn: 0,
              dailyTasks: {},
              updatedAt: serverTimestamp(),
            });
            currentAccount = normalizeDailyCounters(latest, today);
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
        }
      }

      let vault: UserPrivateVault | null = null;
      try {
        const vSnap = await getDoc(vaultRef);
        if (vSnap.exists()) {
          vault = vSnap.data() as UserPrivateVault;
        } else if (user.email) {
          const enc = await encryptFieldOnServer('email', user.email);
          const newVault: UserPrivateVault = {
            userId: user.uid,
            emailMasked: enc.masked,
            encryptedEmail: enc.encrypted,
            encryptionAlgorithm: 'AES-256-GCM',
            keyVersion: enc.keyVersion,
          };
          await setDoc(vaultRef, { ...newVault, updatedAt: serverTimestamp() });
          vault = newVault;
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/private/vault`);
      }

      return { account: currentAccount, vault, isNewUser: false, bonusAwarded: 0 };
    }

    // Create new account cleanly (moved inside queued init)
    const email = resolvedEmail;
    const cleanName = deriveDisplayName(email, fallbackName);
    let refCode = generateRefCode(email, user.uid);
    let shouldCreateRefCodeDoc = false;
    let refCodeVerified = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const suffix = Math.random()
        .toString(36)
        .slice(2, 6)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, 'X')
        .padEnd(4, 'X');
      const candidate =
        attempt === 0
          ? refCode
          : `${refCode.slice(0, 18)}${suffix}`.slice(0, 24);
      try {
        const existingCodeSnap = await getDocFromServer(doc(db, 'referralCodes', candidate));
        if (!existingCodeSnap.exists()) {
          refCode = candidate;
          shouldCreateRefCodeDoc = true;
          refCodeVerified = true;
          break;
        }
        const existingOwner = (existingCodeSnap.data() as { ownerId?: string })?.ownerId;
        if (existingOwner === user.uid) {
          refCode = candidate;
          shouldCreateRefCodeDoc = false;
          refCodeVerified = true;
          break;
        }
      } catch {
        continue;
      }
    }
    if (!refCodeVerified) {
      throw new Error('রেফারেল কোড যাচাই করতে সমস্যা হয়েছে, অনুগ্রহ করে আবার চেষ্টা করুন');
    }

    const enteredRef = options?.referredBy?.trim().toUpperCase() || null;

    let validReferrerUid: string | null = null;
    if (enteredRef && enteredRef !== refCode) {
      try {
        const refSnap = await getDocFromServer(doc(db, 'referralCodes', enteredRef));
        if (refSnap.exists()) {
          const data = refSnap.data() as { ownerId?: string };
          if (data.ownerId && data.ownerId !== user.uid) {
            validReferrerUid = data.ownerId;
          }
        }
      } catch {
        // Invalid or unreadable ref code ignored safely
      }
    }

    let existingVault: UserPrivateVault | null = null;
    try {
      const existingVaultSnap = await getDocFromServer(vaultRef);
      if (existingVaultSnap.exists()) {
        existingVault = existingVaultSnap.data() as UserPrivateVault;
      }
    } catch {
      existingVault = null;
    }

    const encEmail = await encryptFieldOnServer('email', email);

    const accountPayload = {
      uid: user.uid,
      name: cleanName,
      refCode,
      referredBy: validReferrerUid ? enteredRef : null,
      balance: 0,
      totalEarned: 0,
      referrals: 0,
      refEarned: 0,
      streakCount: 0,
      streakLast: null,
      dailyDate: today,
      dailySpins: 0,
      dailyAds: 0,
      dailyTodayEarn: 0,
      dailyTasks: {},
      theme: 'dark' as ThemeMode,
      role: 'user' as const,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const vaultPayload: UserPrivateVault = existingVault || {
      userId: user.uid,
      emailMasked: encEmail.masked || maskEmail(email),
      encryptedEmail: encEmail.encrypted,
      encryptionAlgorithm: 'AES-256-GCM',
      keyVersion: encEmail.keyVersion,
    };

    let refCfg: ReferralSettingsConfig | null = null;
    let shouldCreateReferralClaim = false;
    if (validReferrerUid && enteredRef) {
      try {
        const refSettingsSnap = await getDocFromServer(doc(db, 'taskSettings', 'referral_settings'));
        refCfg = refSettingsSnap.exists()
          ? parseReferralSettings(refSettingsSnap.data() as Record<string, unknown>)
          : { ...DEFAULT_REFERRAL_SETTINGS };
        const existingClaimSnap = await getDocFromServer(doc(db, 'referralClaims', user.uid));
        shouldCreateReferralClaim = !existingClaimSnap.exists();
      } catch {
        shouldCreateReferralClaim = false;
      }
    }

    const batch = writeBatch(db);
    batch.set(userRef, accountPayload);
    if (!existingVault) {
      batch.set(vaultRef, { ...vaultPayload, updatedAt: serverTimestamp() });
    }
    if (shouldCreateRefCodeDoc) {
      batch.set(doc(db, 'referralCodes', refCode), {
        refCode,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
      });
    }

    if (validReferrerUid && enteredRef && refCfg && shouldCreateReferralClaim) {
      batch.set(doc(db, 'referralClaims', user.uid), {
        referredUid: user.uid,
        referrerUid: validReferrerUid,
        refCode: enteredRef,
        amount: roundMoney(refCfg.referrerBonus),
        friendAmount: roundMoney(refCfg.friendBonus),
        minTasks: Math.round(refCfg.minTasks),
        qualified: refCfg.minTasks === 0,
        friendClaimed: false,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
    }

    await notifyTelegramEvent({
      type: 'account_created',
      userName: cleanName,
      refCode,
      referredBy: validReferrerUid && enteredRef ? enteredRef : undefined,
    });

    const createdSnap = await getUserDocPreferServer(userRef);
    return {
      account: createdSnap.data() as UserAccount,
      vault: vaultPayload,
      isNewUser: true,
      bonusAwarded: 0,
    };
  });
}

// (New user creation moved cleanly inside serialized ensureUserAccount above)

export interface InviteeReferralStatus {
  refCode: string;
  friendAmount: number;
  minTasks: number;
  qualified: boolean;
  friendClaimed: boolean;
  completedCount: number;
}

export async function evaluateAndClaimInviteeReferral(
  uid: string
): Promise<{ unlockedBonus: number; status: InviteeReferralStatus | null }> {
  return enqueueWalletOp(uid, async () => {
    const claimRef = doc(db, 'referralClaims', uid);
    const userRef = doc(db, 'users', uid);

    let claimSnap;
    let userSnap;
    try {
      [claimSnap, userSnap] = await Promise.all([getDoc(claimRef), getUserDocPreferServer(userRef)]);
    } catch {
      return { unlockedBonus: 0, status: null };
    }

    if (!claimSnap.exists() || !userSnap.exists()) {
      return { unlockedBonus: 0, status: null };
    }

    const claimData = claimSnap.data() as {
      refCode?: string;
      friendAmount?: number;
      minTasks?: number;
      qualified?: boolean;
      friendClaimed?: boolean;
    };
    const userAccount = userSnap.data() as UserAccount;
    const completedCount = countCompletedActivities(userAccount);
    const minTasks = Number.isInteger(claimData.minTasks) ? Number(claimData.minTasks) : 1;
    const friendAmount = roundMoney(Number(claimData.friendAmount ?? 0));
    const refCode = String(claimData.refCode || '');
    const wasQualified = Boolean(claimData.qualified);
    const wasFriendClaimed = Boolean(claimData.friendClaimed);
    const qualifiesNow = wasQualified || isReferralQualified(completedCount, minTasks);

    if (!qualifiesNow || (wasQualified && wasFriendClaimed)) {
      return {
        unlockedBonus: 0,
        status: {
          refCode,
          friendAmount,
          minTasks,
          qualified: qualifiesNow,
          friendClaimed: wasFriendClaimed,
          completedCount,
        },
      };
    }

    const shouldCreditFriend = !wasFriendClaimed && friendAmount > 0 && !userAccount.suspended;
    const receipt = shouldCreditFriend
      ? await signRewardReceipt({ action: 'referral_friend', amount: friendAmount })
      : null;
    const txRef = doc(db, 'users', uid, 'transactions', makeDocId('tx'));

    try {
      const txRes = await runTransaction(db, async (tx) => {
        const [freshClaim, freshUser] = await Promise.all([tx.get(claimRef), tx.get(userRef)]);
        if (!freshClaim.exists() || !freshUser.exists()) return { unlocked: 0, nextBalance: userAccount.balance };

        const fc = freshClaim.data() as {
          qualified?: boolean;
          friendClaimed?: boolean;
          friendAmount?: number;
          minTasks?: number;
        };
        const fu = freshUser.data() as UserAccount;
        const freshCompleted = countCompletedActivities(fu);
        const freshMin = Number.isInteger(fc.minTasks) ? Number(fc.minTasks) : 1;
        if (!fc.qualified && !isReferralQualified(freshCompleted, freshMin)) {
          return { unlocked: 0, nextBalance: fu.balance };
        }

        const amt = roundMoney(Number(fc.friendAmount ?? 0));
        const canCredit = !fc.friendClaimed && amt > 0 && !fu.suspended && receipt !== null;

        tx.update(claimRef, {
          qualified: true,
          friendClaimed: true,
          updatedAt: serverTimestamp(),
        });

        if (canCredit && receipt) {
          const nextWallet = computeNextWalletState(fu.balance, fu.totalEarned, amt);
          tx.update(userRef, {
            balance: nextWallet.balance,
            totalEarned: nextWallet.totalEarned,
            updatedAt: serverTimestamp(),
          });
          tx.set(txRef, {
            userId: uid,
            type: 'in',
            amount: amt,
            title: 'রেফারেল স্বাগত বোনাস',
            icon: '🎁',
            receiptId: receipt.receiptId,
            receiptSignature: receipt.receiptSignature,
            createdAt: serverTimestamp(),
          });
          return { unlocked: amt, nextBalance: nextWallet.balance };
        }
        return { unlocked: 0, nextBalance: fu.balance };
      });

      if (txRes.unlocked > 0) {
        void notifyTelegramEvent({
          type: 'referral_friend_bonus',
          userName: userAccount.name,
          refCode: userAccount.refCode || refCode,
          amount: txRes.unlocked,
          balance: txRes.nextBalance,
        });
      }

      return {
        unlockedBonus: txRes.unlocked,
        status: {
          refCode,
          friendAmount,
          minTasks,
          qualified: true,
          friendClaimed: true,
          completedCount,
        },
      };
    } catch {
      return {
        unlockedBonus: 0,
        status: {
          refCode,
          friendAmount,
          minTasks,
          qualified: wasQualified,
          friendClaimed: wasFriendClaimed,
          completedCount,
        },
      };
    }
  });
}

export async function claimPendingReferrals(uid: string, _account?: UserAccount): Promise<number> {
  return enqueueWalletOp(uid, async () => {
    let claimsSnap;
    try {
      claimsSnap = await getDocs(query(collection(db, 'referralClaims'), where('referrerUid', '==', uid), limit(10)));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'referralClaims');
    }

    const pendingDocs = claimsSnap.docs.filter((d) => {
      const data = d.data();
      return data.status === 'pending' && data.qualified !== false;
    });
    if (pendingDocs.length === 0) return 0;

    let claimedCount = 0;
    let totalPayout = 0;
    let lastBalance = _account?.balance ?? 0;
    let userName = _account?.name ?? '';
    let refCode = _account?.refCode ?? '';
    const userRef = doc(db, 'users', uid);

    for (const claimDoc of pendingDocs) {
      const claimAmount = roundMoney(Number(claimDoc.data().amount || REFERRAL_BONUS));
      const receipt = await signRewardReceipt({ action: 'referral', amount: claimAmount });
      const txRef = doc(db, 'users', uid, 'transactions', makeDocId('tx'));
      try {
        const res = await runTransaction(db, async (tx) => {
          const [freshClaim, freshUser] = await Promise.all([tx.get(claimDoc.ref), tx.get(userRef)]);
          if (!freshClaim.exists()) return null;
          const fc = freshClaim.data();
          if (fc.status !== 'pending' || fc.qualified === false) return null;
          if (!freshUser.exists()) return null;

          const u = freshUser.data() as UserAccount;
          if (u.suspended) return null;
          const payout = roundMoney(Number(fc.amount || claimAmount));
          const nextWallet = computeNextWalletState(u.balance, u.totalEarned, payout);

          tx.update(claimDoc.ref, {
            status: 'claimed',
            updatedAt: serverTimestamp(),
          });
          tx.update(userRef, {
            balance: nextWallet.balance,
            totalEarned: nextWallet.totalEarned,
            referrals: Number(u.referrals || 0) + 1,
            refEarned: addMoney(u.refEarned || 0, payout),
            updatedAt: serverTimestamp(),
          });
          tx.set(txRef, {
            userId: uid,
            type: 'in',
            amount: payout,
            title: 'রেফারেল বোনাস',
            icon: '🤝',
            receiptId: receipt.receiptId,
            receiptSignature: receipt.receiptSignature,
            createdAt: serverTimestamp(),
          });
          return {
            payout,
            balance: nextWallet.balance,
            name: u.name,
            refCode: u.refCode,
          };
        });
        if (res) {
          claimedCount += 1;
          totalPayout = addMoney(totalPayout, res.payout);
          lastBalance = res.balance;
          userName = res.name;
          refCode = res.refCode;
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `referralClaims/${claimDoc.id}`);
      }
    }

    if (claimedCount > 0) {
      void notifyTelegramEvent({
        type: 'referral_bonus',
        userName: userName || undefined,
        refCode: refCode || undefined,
        count: claimedCount,
        amount: totalPayout,
        balance: lastBalance,
      });
    }

    return claimedCount;
  });
}

export async function fetchUserActivity(uid: string): Promise<{
  transactions: TransactionRecord[];
  withdrawals: WithdrawalRecord[];
}> {
  try {
    const [txSnap, wdSnap] = await Promise.all([
      getDocs(query(collection(db, 'users', uid, 'transactions'), where('userId', '==', uid), limit(30))),
      getDocs(query(collection(db, 'withdrawals'), where('userId', '==', uid), limit(30))),
    ]);

    const transactions: TransactionRecord[] = txSnap.docs
      .map((d) => {
        const data = d.data();
        const ms = timestampToMs(data.createdAt);
        return {
          id: d.id,
          userId: data.userId,
          type: data.type,
          amount: Number(data.amount || 0),
          title: String(data.title || ''),
          icon: String(data.icon || '💰'),
          receiptId: String(data.receiptId || ''),
          receiptSignature: String(data.receiptSignature || ''),
          createdAtMs: ms,
          dateLabel: formatBnDate(new Date(ms)),
        };
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs);

    const withdrawals: WithdrawalRecord[] = wdSnap.docs
      .map((d) => {
        const data = d.data();
        const ms = timestampToMs(data.createdAt);
        const amount = Number(data.amount || 0);
        const fee = data.fee !== undefined ? Number(data.fee || 0) : 0;
        const totalAmount =
          data.totalAmount !== undefined ? Number(data.totalAmount || amount) : roundMoney(amount + fee);
        return {
          id: d.id,
          userId: data.userId,
          userName: String(data.userName || ''),
          method: data.method as PaymentMethod,
          maskedNumber: String(data.maskedNumber || '***'),
          encryptedAccount: String(data.encryptedAccount || ''),
          amount,
          fee,
          totalAmount,
          status: data.status as WithdrawalStatus,
          receiptId: String(data.receiptId || ''),
          receiptSignature: String(data.receiptSignature || ''),
          createdAtMs: ms,
          dateLabel: formatBnDate(new Date(ms)),
        };
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs);

    return { transactions, withdrawals };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users/${uid}/activity`);
  }
}

export async function performDailyCheckin(uid: string, account: UserAccount): Promise<number> {
  return enqueueWalletOp(uid, async () => {
    const userRef = doc(db, 'users', uid);
    const today = todayKey();
    const yest = yesterdayKey();
    const fallbackEmail = auth.currentUser?.email || `${uid}@takadear.app`;
    let freshAccount = account;
    try {
      const repaired = await repairLegacyUserDocIfNeeded(
        userRef,
        uid,
        fallbackEmail,
        today,
        account.name || auth.currentUser?.displayName || undefined
      );
      if (repaired) {
        freshAccount = repaired;
      }
    } catch (repairErr) {
      if (isPermissionDeniedError(repairErr)) {
        handleFirestoreError(repairErr, OperationType.UPDATE, `users/${uid}`);
      }
    }
    const preview = calculateNextStreak(
      freshAccount.streakLast ?? null,
      Math.trunc(Number(freshAccount.streakCount || 0)),
      today,
      yest
    );
    if (preview.alreadyChecked) {
      throw new Error('আজকের চেক-ইন ইতিমধ্যেই সম্পন্ন হয়েছে');
    }

    const receipt = await signRewardReceipt({
      action: 'checkin',
      amount: preview.reward,
      streakDay: preview.nextCount,
    });

    const txRef = doc(db, 'users', uid, 'transactions', makeDocId('tx'));
    let lastCheckedRaw: Record<string, unknown> | null = null;

    try {
      const txRes = await runTransaction(db, async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists()) throw new Error('ব্যবহারকারী পাওয়া যায়নি');
        lastCheckedRaw = snap.data() as Record<string, unknown>;
        const u = lastCheckedRaw as unknown as UserAccount;
        if (u.suspended) throw new Error('আপনার অ্যাকাউন্ট সাসপেন্ড করা হয়েছে');

        const result = calculateNextStreak(
          u.streakLast ?? null,
          Math.trunc(Number(u.streakCount || 0)),
          today,
          yest
        );
        if (result.alreadyChecked) {
          throw new Error('আজকের চেক-ইন ইতিমধ্যেই সম্পন্ন হয়েছে');
        }
        if (result.reward !== preview.reward) {
          throw new Error('চেক-ইন তথ্য আপডেট হয়েছে, অনুগ্রহ করে আবার চেষ্টা করুন');
        }

        const base = normalizeDailyCounters(u, today);
        const nextWallet = computeRewardCreditState(
          Number(base.balance || 0),
          Number(base.totalEarned || 0),
          Number(base.dailyTodayEarn || 0),
          result.reward
        );

        tx.update(userRef, {
          streakLast: today,
          streakCount: Math.trunc(result.nextCount),
          balance: nextWallet.balance,
          totalEarned: nextWallet.totalEarned,
          dailyTodayEarn: nextWallet.dailyTodayEarn,
          dailyDate: today,
          ...(u.dailyDate !== today
            ? {
                dailySpins: 0,
                dailyAds: 0,
                dailyTasks: {},
              }
            : {}),
          updatedAt: serverTimestamp(),
        });
        tx.set(txRef, {
          userId: uid,
          type: 'in',
          amount: result.reward,
          title: `দৈনিক চেক-ইন (দিন ${result.nextCount})`,
          icon: '📅',
          receiptId: receipt.receiptId,
          receiptSignature: receipt.receiptSignature,
          createdAt: serverTimestamp(),
        });
        return {
          reward: result.reward,
          streakDay: result.nextCount,
          balance: nextWallet.balance,
          userName: u.name,
          refCode: u.refCode,
        };
      });
      void notifyTelegramEvent({
        type: 'checkin',
        userName: txRes.userName,
        refCode: txRes.refCode,
        streakDay: txRes.streakDay,
        amount: txRes.reward,
        balance: txRes.balance,
      });
      return txRes.reward;
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('ইতিমধ্যেই সম্পন্ন') ||
          err.message.includes('সাসপেন্ড') ||
          err.message.includes('পাওয়া যায়নি') ||
          err.message.includes('চেক-ইন তথ্য'))
      ) {
        throw err;
      }
      if (isPermissionDeniedError(err)) {
        logUserRuleDiagnostic('performDailyCheckin', uid, lastCheckedRaw, {
          reward: preview.reward,
          today,
        });
      }
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
    }
  });
}

export async function submitEncryptedWithdrawal(
  uid: string,
  account: UserAccount,
  method: PaymentMethod,
  accountNumber: string,
  amount: number
): Promise<WithdrawalRecord> {
  return enqueueWalletOp(uid, async () => {
    if (method !== 'bKash') {
      throw new Error('বর্তমানে শুধুমাত্র বিকাশ (bKash) এর মাধ্যমে উত্তোলন করা যাবে');
    }

    const liveWithdrawalSettings = await fetchWithdrawalSettings();
    const { payoutAmount, fee, totalDeducted } = calculateWithdrawalTotal(amount, liveWithdrawalSettings);
    const preErr = validateWithdrawal(accountNumber, payoutAmount, account.balance, fee);
    if (preErr) {
      throw new Error(preErr);
    }

    const encryptedRes = await encryptFieldOnServer('wallet_number', accountNumber);
    const receipt = await signRewardReceipt({
      action: 'withdrawal',
      amount: totalDeducted,
      method: 'bKash',
    });

    const withdrawalId = makeDocId('wd');
    const userRef = doc(db, 'users', uid);
    const wdRef = doc(db, 'withdrawals', withdrawalId);
    const txRef = doc(db, 'users', uid, 'transactions', makeDocId('tx'));

    let resolvedName = account.name;
    let resolvedRefCode = account.refCode;
    let resolvedBalance = account.balance;

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists()) throw new Error('ব্যবহারকারী পাওয়া যায়নি');
        const u = snap.data() as UserAccount;
        if (u.suspended) throw new Error('আপনার অ্যাকাউন্ট সাসপেন্ড করা হয়েছে');

        const serverErr = validateWithdrawal(accountNumber, payoutAmount, u.balance, fee);
        if (serverErr) {
          throw new Error(serverErr);
        }

        const nextWallet = computeNextWalletState(u.balance, u.totalEarned, -totalDeducted);
        resolvedName = u.name;
        resolvedRefCode = u.refCode;
        resolvedBalance = nextWallet.balance;

        tx.update(userRef, {
          balance: nextWallet.balance,
          updatedAt: serverTimestamp(),
        });
        tx.set(wdRef, {
          userId: uid,
          userName: u.name,
          method: 'bKash',
          maskedNumber: encryptedRes.masked,
          encryptedAccount: encryptedRes.encrypted,
          amount: payoutAmount,
          fee,
          totalAmount: totalDeducted,
          status: 'প্রসেসিং',
          receiptId: receipt.receiptId,
          receiptSignature: receipt.receiptSignature,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        tx.set(txRef, {
          userId: uid,
          type: 'out',
          amount: totalDeducted,
          title:
            fee > 0
              ? `bKash উত্তোলন (৳${fmtAmount(payoutAmount)} + ফি ৳${fmtAmount(fee)})`
              : `bKash উত্তোলন (${encryptedRes.masked})`,
          icon: '🏦',
          receiptId: receipt.receiptId,
          receiptSignature: receipt.receiptSignature,
          createdAt: serverTimestamp(),
        });
      });
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('ব্যালেন্স') ||
          err.message.includes('উত্তোলন') ||
          err.message.includes('বিকাশ') ||
          err.message.includes('মোবাইল') ||
          err.message.includes('সাসপেন্ড') ||
          err.message.includes('পাওয়া যায়নি'))
      ) {
        throw err;
      }
      handleFirestoreError(err, OperationType.WRITE, `withdrawals/${withdrawalId}`);
    }

    void notifyTelegramEvent({
      type: 'withdrawal_request',
      userName: resolvedName,
      refCode: resolvedRefCode,
      method: 'bKash',
      maskedNumber: encryptedRes.masked,
      amount: payoutAmount,
      balance: resolvedBalance,
      receiptId: receipt.receiptId,
    });

    return {
      id: withdrawalId,
      userId: uid,
      userName: resolvedName,
      method: 'bKash',
      maskedNumber: encryptedRes.masked,
      encryptedAccount: encryptedRes.encrypted,
      amount: payoutAmount,
      fee,
      totalAmount: totalDeducted,
      status: 'প্রসেসিং',
      receiptId: receipt.receiptId,
      receiptSignature: receipt.receiptSignature,
      createdAtMs: Date.now(),
      dateLabel: formatBnDate(new Date()),
    };
  });
}

export async function updateUserTheme(uid: string, theme: ThemeMode): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), {
      theme,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

// ===== Gmail & Facebook Account Sell Tasks =====
export async function fetchAccountSellSettings(): Promise<AccountSellSettingsConfig> {
  try {
    const snap = await getDoc(doc(db, 'taskSettings', 'account_sell'));
    if (!snap.exists()) {
      return { ...DEFAULT_ACCOUNT_SELL_SETTINGS };
    }
    const d = snap.data();
    return {
      gmailEnabled: typeof d.gmailEnabled === 'boolean' ? d.gmailEnabled : true,
      gmailPrice: Number(d.gmailPrice || DEFAULT_ACCOUNT_SELL_SETTINGS.gmailPrice),
      gmailPassword: String(d.gmailPassword || ''),
      gmailNote: String(d.gmailNote || DEFAULT_ACCOUNT_SELL_SETTINGS.gmailNote),
      facebookEnabled: typeof d.facebookEnabled === 'boolean' ? d.facebookEnabled : true,
      facebookPrice: Number(d.facebookPrice || DEFAULT_ACCOUNT_SELL_SETTINGS.facebookPrice),
      facebookPassword: String(d.facebookPassword || ''),
      facebookNote: String(d.facebookNote || DEFAULT_ACCOUNT_SELL_SETTINGS.facebookNote),
    };
  } catch {
    return { ...DEFAULT_ACCOUNT_SELL_SETTINGS };
  }
}

export function subscribeAccountSellSettings(
  onSettings: (settings: AccountSellSettingsConfig) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'taskSettings', 'account_sell'),
    (snap) => {
      if (!snap.exists()) {
        onSettings({ ...DEFAULT_ACCOUNT_SELL_SETTINGS });
        return;
      }
      const d = snap.data();
      onSettings({
        gmailEnabled: typeof d.gmailEnabled === 'boolean' ? d.gmailEnabled : true,
        gmailPrice: Number(d.gmailPrice || DEFAULT_ACCOUNT_SELL_SETTINGS.gmailPrice),
        gmailPassword: String(d.gmailPassword || ''),
        gmailNote: String(d.gmailNote || DEFAULT_ACCOUNT_SELL_SETTINGS.gmailNote),
        facebookEnabled: typeof d.facebookEnabled === 'boolean' ? d.facebookEnabled : true,
        facebookPrice: Number(d.facebookPrice || DEFAULT_ACCOUNT_SELL_SETTINGS.facebookPrice),
        facebookPassword: String(d.facebookPassword || ''),
        facebookNote: String(d.facebookNote || DEFAULT_ACCOUNT_SELL_SETTINGS.facebookNote),
      });
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export async function adminSaveAccountSellSettings(
  settings: AccountSellSettingsConfig
): Promise<void> {
  try {
    await setDoc(doc(db, 'taskSettings', 'account_sell'), {
      gmailEnabled: Boolean(settings.gmailEnabled),
      gmailPrice: Number(settings.gmailPrice),
      gmailPassword: settings.gmailPassword.trim().slice(0, 120),
      gmailNote: settings.gmailNote.trim().slice(0, 240),
      facebookEnabled: Boolean(settings.facebookEnabled),
      facebookPrice: Number(settings.facebookPrice),
      facebookPassword: settings.facebookPassword.trim().slice(0, 120),
      facebookNote: settings.facebookNote.trim().slice(0, 240),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'taskSettings/account_sell');
  }
}

// ===== Referral Settings & Conditions =====
function parseReferralSettings(d?: Record<string, unknown> | null): ReferralSettingsConfig {
  if (!d) return { ...DEFAULT_REFERRAL_SETTINGS };
  const rawReferrer = Number(d.referrerBonus);
  const rawFriend = Number(d.friendBonus);
  const rawMinTasks = Number(d.minTasks);
  return {
    referrerBonus:
      Number.isFinite(rawReferrer) && rawReferrer >= 0.5 && rawReferrer <= 100
        ? roundMoney(rawReferrer)
        : DEFAULT_REFERRAL_SETTINGS.referrerBonus,
    friendBonus:
      Number.isFinite(rawFriend) && rawFriend >= 0 && rawFriend <= 100
        ? roundMoney(rawFriend)
        : DEFAULT_REFERRAL_SETTINGS.friendBonus,
    minTasks:
      Number.isInteger(rawMinTasks) && rawMinTasks >= 0 && rawMinTasks <= 10
        ? rawMinTasks
        : DEFAULT_REFERRAL_SETTINGS.minTasks,
    conditionNote:
      typeof d.conditionNote === 'string' && d.conditionNote.trim()
        ? d.conditionNote.trim().slice(0, 300)
        : DEFAULT_REFERRAL_SETTINGS.conditionNote,
  };
}

export async function fetchReferralSettings(): Promise<ReferralSettingsConfig> {
  try {
    const snap = await getDoc(doc(db, 'taskSettings', 'referral_settings'));
    if (!snap.exists()) {
      return { ...DEFAULT_REFERRAL_SETTINGS };
    }
    return parseReferralSettings(snap.data() as Record<string, unknown>);
  } catch {
    return { ...DEFAULT_REFERRAL_SETTINGS };
  }
}

export function subscribeReferralSettings(
  onSettings: (settings: ReferralSettingsConfig) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'taskSettings', 'referral_settings'),
    (snap) => {
      if (!snap.exists()) {
        onSettings({ ...DEFAULT_REFERRAL_SETTINGS });
      } else {
        onSettings(parseReferralSettings(snap.data() as Record<string, unknown>));
      }
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export async function adminSaveReferralSettings(
  settings: ReferralSettingsConfig
): Promise<void> {
  try {
    await setDoc(doc(db, 'taskSettings', 'referral_settings'), {
      referrerBonus: roundMoney(Number(settings.referrerBonus)),
      friendBonus: roundMoney(Number(settings.friendBonus)),
      minTasks: Math.round(Number(settings.minTasks)),
      conditionNote: (settings.conditionNote || '').trim().slice(0, 300),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'taskSettings/referral_settings');
  }
}

// ===== Withdrawal Fee Settings =====
function parseWithdrawalSettings(d?: Record<string, unknown> | null): WithdrawalSettingsConfig {
  if (!d) return { ...DEFAULT_WITHDRAWAL_SETTINGS };
  const feeType = d.feeType === 'percent' ? 'percent' : 'fixed';
  const rawVal = Number(d.feeValue);
  const maxVal = feeType === 'percent' ? 50 : 1000;
  return {
    feeType,
    feeValue:
      Number.isFinite(rawVal) && rawVal >= 0 && rawVal <= maxVal
        ? roundMoney(rawVal)
        : DEFAULT_WITHDRAWAL_SETTINGS.feeValue,
  };
}

export async function fetchWithdrawalSettings(): Promise<WithdrawalSettingsConfig> {
  try {
    const snap = await getDoc(doc(db, 'taskSettings', 'withdrawal_settings'));
    if (!snap.exists()) {
      return { ...DEFAULT_WITHDRAWAL_SETTINGS };
    }
    return parseWithdrawalSettings(snap.data() as Record<string, unknown>);
  } catch {
    return { ...DEFAULT_WITHDRAWAL_SETTINGS };
  }
}

export function subscribeWithdrawalSettings(
  onSettings: (settings: WithdrawalSettingsConfig) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'taskSettings', 'withdrawal_settings'),
    (snap) => {
      if (!snap.exists()) {
        onSettings({ ...DEFAULT_WITHDRAWAL_SETTINGS });
      } else {
        onSettings(parseWithdrawalSettings(snap.data() as Record<string, unknown>));
      }
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export async function adminSaveWithdrawalSettings(
  settings: WithdrawalSettingsConfig
): Promise<void> {
  try {
    await setDoc(doc(db, 'taskSettings', 'withdrawal_settings'), {
      feeType: settings.feeType === 'percent' ? 'percent' : 'fixed',
      feeValue: roundMoney(Math.max(0, Number(settings.feeValue || 0))),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'taskSettings/withdrawal_settings');
  }
}

export async function submitAccountForSale(params: {
  uid: string;
  account: UserAccount;
  platform: AccountPlatform;
  identifier: string;
  password: string;
  price: number;
  note?: string;
}): Promise<AccountSubmissionRecord> {
  const { uid, account, platform, identifier, password, note } = params;
  const liveSellCfg = await fetchAccountSellSettings();
  const isEnabled = platform === 'gmail' ? liveSellCfg.gmailEnabled : liveSellCfg.facebookEnabled;
  if (!isEnabled) {
    throw new Error('এই কাজটি বর্তমানে বন্ধ আছে — শীঘ্রই আসছে');
  }
  const officialPrice = roundMoney(
    platform === 'gmail' ? liveSellCfg.gmailPrice : liveSellCfg.facebookPrice
  );

  const payloadJson = JSON.stringify({
    identifier: identifier.trim(),
    password: password.trim(),
    note: note?.trim() || '',
  });
  const encryptedRes = await encryptFieldOnServer('credentials', payloadJson);
  const receipt = await signRewardReceipt({
    action: 'account_submit',
    amount: officialPrice,
    platform,
  });

  const subId = makeDocId('sub');
  const maskedIdentifier = maskAccountIdentifier(identifier);

  try {
    await setDoc(doc(db, 'accountSubmissions', subId), {
      userId: uid,
      userName: account.name,
      platform,
      maskedIdentifier,
      encryptedCredentials: encryptedRes.encrypted,
      amount: officialPrice,
      status: 'পেন্ডিং',
      adminNote: null,
      receiptId: receipt.receiptId,
      receiptSignature: receipt.receiptSignature,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `accountSubmissions/${subId}`);
  }

  void notifyTelegramEvent({
    type: 'account_submission',
    userName: account.name,
    refCode: account.refCode,
    platform,
    maskedIdentifier,
    amount: officialPrice,
  });

  return {
    id: subId,
    userId: uid,
    userName: account.name,
    platform,
    maskedIdentifier,
    encryptedCredentials: encryptedRes.encrypted,
    amount: officialPrice,
    status: 'পেন্ডিং',
    adminNote: null,
    receiptId: receipt.receiptId,
    receiptSignature: receipt.receiptSignature,
    createdAtMs: Date.now(),
    dateLabel: formatBnDate(new Date()),
  };
}

export async function fetchUserAccountSubmissions(uid: string): Promise<AccountSubmissionRecord[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'accountSubmissions'), where('userId', '==', uid), limit(50))
    );
    return snap.docs
      .map((d) => {
        const data = d.data();
        const ms = timestampToMs(data.createdAt);
        return {
          id: d.id,
          userId: String(data.userId || ''),
          userName: String(data.userName || ''),
          platform: data.platform as AccountPlatform,
          maskedIdentifier: String(data.maskedIdentifier || '***'),
          encryptedCredentials: String(data.encryptedCredentials || ''),
          amount: Number(data.amount || 0),
          status: data.status as AccountSubmissionStatus,
          adminNote: data.adminNote ? String(data.adminNote) : null,
          receiptId: String(data.receiptId || ''),
          receiptSignature: String(data.receiptSignature || ''),
          createdAtMs: ms,
          dateLabel: formatBnDate(new Date(ms)),
        };
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'accountSubmissions');
  }
}

// ===== Admin Operations =====
export interface AdminDashboardData {
  users: UserAccount[];
  withdrawals: WithdrawalRecord[];
  recentTransactions: Array<TransactionRecord & { userName: string }>;
  submissions: AccountSubmissionRecord[];
  accountSellSettings: AccountSellSettingsConfig;
  referralSettings: ReferralSettingsConfig;
  withdrawalSettings: WithdrawalSettingsConfig;
}

export async function fetchAdminDashboardData(): Promise<AdminDashboardData> {
  try {
    const [usersSnap, wdSnap, subSnap, accountSellSettings, referralSettings, withdrawalSettings] =
      await Promise.all([
        getDocs(query(collection(db, 'users'), limit(300))),
        getDocs(query(collection(db, 'withdrawals'), limit(150))),
        getDocs(query(collection(db, 'accountSubmissions'), limit(150))),
        fetchAccountSellSettings(),
        fetchReferralSettings(),
        fetchWithdrawalSettings(),
      ]);

    const rawUsers = usersSnap.docs.map((d) => d.data() as UserAccount);
    const vaultResults = await Promise.allSettled(
      rawUsers.map((u) => getDoc(doc(db, 'users', u.uid, 'private', 'vault')))
    );

    const maskedByUid = new Map<string, string>();
    const decryptQueue: Array<{ id: string; encrypted: string }> = [];
    vaultResults.forEach((res, idx) => {
      const uid = rawUsers[idx]?.uid;
      if (!uid || res.status !== 'fulfilled' || !res.value.exists()) return;
      const v = res.value.data() as Partial<UserPrivateVault>;
      if (v.emailMasked) {
        maskedByUid.set(uid, String(v.emailMasked));
      }
      if (v.encryptedEmail) {
        decryptQueue.push({ id: uid, encrypted: String(v.encryptedEmail) });
      }
    });

    let decryptedEmailMap: Record<string, string | null> = {};
    if (decryptQueue.length > 0) {
      try {
        decryptedEmailMap = await decryptBatchOnServer(decryptQueue);
      } catch {
        decryptedEmailMap = {};
      }
    }

    const users: UserAccount[] = rawUsers.map((u) => ({
      ...u,
      email: decryptedEmailMap[u.uid] || null,
      emailMasked: maskedByUid.get(u.uid) || null,
    }));
    const withdrawals = wdSnap.docs
      .map((d) => {
        const data = d.data();
        const ms = timestampToMs(data.createdAt);
        const amount = Number(data.amount || 0);
        const fee = data.fee !== undefined ? Number(data.fee || 0) : 0;
        const totalAmount =
          data.totalAmount !== undefined ? Number(data.totalAmount || amount) : roundMoney(amount + fee);
        return {
          id: d.id,
          userId: data.userId,
          userName: String(data.userName || ''),
          method: data.method as PaymentMethod,
          maskedNumber: String(data.maskedNumber || '***'),
          encryptedAccount: String(data.encryptedAccount || ''),
          amount,
          fee,
          totalAmount,
          status: data.status as WithdrawalStatus,
          receiptId: String(data.receiptId || ''),
          receiptSignature: String(data.receiptSignature || ''),
          createdAtMs: ms,
          dateLabel: formatBnDate(new Date(ms)),
        };
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs);

    const submissions: AccountSubmissionRecord[] = subSnap.docs
      .map((d) => {
        const data = d.data();
        const ms = timestampToMs(data.createdAt);
        return {
          id: d.id,
          userId: String(data.userId || ''),
          userName: String(data.userName || ''),
          platform: data.platform as AccountPlatform,
          maskedIdentifier: String(data.maskedIdentifier || '***'),
          encryptedCredentials: String(data.encryptedCredentials || ''),
          amount: Number(data.amount || 0),
          status: data.status as AccountSubmissionStatus,
          adminNote: data.adminNote ? String(data.adminNote) : null,
          receiptId: String(data.receiptId || ''),
          receiptSignature: String(data.receiptSignature || ''),
          createdAtMs: ms,
          dateLabel: formatBnDate(new Date(ms)),
        };
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs);

    const txPromises = users.slice(0, 20).map(async (u) => {
      const tSnap = await getDocs(
        query(collection(db, 'users', u.uid, 'transactions'), orderBy('createdAt', 'desc'), limit(5))
      );
      return tSnap.docs.map((d) => {
        const data = d.data();
        const ms = timestampToMs(data.createdAt);
        return {
          id: d.id,
          userId: data.userId,
          userName: u.name,
          type: data.type as 'in' | 'out',
          amount: Number(data.amount || 0),
          title: String(data.title || ''),
          icon: String(data.icon || '💰'),
          receiptId: String(data.receiptId || ''),
          receiptSignature: String(data.receiptSignature || ''),
          createdAtMs: ms,
          dateLabel: formatBnDate(new Date(ms)),
        };
      });
    });

    const recentTransactions = (await Promise.all(txPromises))
      .flat()
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, 30);

    return {
      users,
      withdrawals,
      recentTransactions,
      submissions,
      accountSellSettings,
      referralSettings,
      withdrawalSettings,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'admin/dashboard');
  }
}


export async function adminAdjustUserBalance(
  targetUid: string,
  delta: number,
  customNote?: string
): Promise<void> {
  const cleanDelta = roundMoney(delta);
  if (!Number.isFinite(cleanDelta) || cleanDelta === 0) {
    throw new Error('সঠিক টাকার পরিমাণ লিখুন');
  }

  const receipt = await signRewardReceipt({
    action: 'admin_adjust',
    amount: Math.abs(cleanDelta),
  });

  const userRef = doc(db, 'users', targetUid);
  const txRef = doc(db, 'users', targetUid, 'transactions', makeDocId('tx'));

  try {
    const txRes = await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) throw new Error('ব্যবহারকারী পাওয়া যায়নি');

      const u = snap.data() as UserAccount;
      const nextWallet = computeNextWalletState(u.balance, u.totalEarned, cleanDelta);

      tx.update(userRef, {
        balance: nextWallet.balance,
        totalEarned: nextWallet.totalEarned,
        updatedAt: serverTimestamp(),
      });
      tx.set(txRef, {
        userId: targetUid,
        type: cleanDelta >= 0 ? 'in' : 'out',
        amount: Math.abs(cleanDelta),
        title: customNote?.trim()
          ? customNote.trim().slice(0, 120)
          : cleanDelta >= 0
            ? 'অ্যাডমিন ক্রেডিট'
            : 'অ্যাডমিন ডেবিট',
        icon: '🛡️',
        receiptId: receipt.receiptId,
        receiptSignature: receipt.receiptSignature,
        createdAt: serverTimestamp(),
      });
      return {
        userName: u.name,
        nextBalance: nextWallet.balance,
      };
    });
    void notifyTelegramEvent({
      type: 'admin_adjust',
      targetUid,
      userName: txRes.userName,
      delta: cleanDelta,
      balance: txRes.nextBalance,
      note: customNote?.trim() || undefined,
    });
  } catch (err) {
    if (err instanceof Error && (err.message.includes('পাওয়া যায়নি') || err.message.includes('শূন্যের নিচে'))) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `users/${targetUid}`);
  }
}

export async function adminUpdateWithdrawalStatus(
  withdrawal: WithdrawalRecord,
  status: 'সম্পন্ন' | 'বাতিল'
): Promise<void> {
  const wdRef = doc(db, 'withdrawals', withdrawal.id);
  const userRef = doc(db, 'users', withdrawal.userId);
  const expectedRefund = roundMoney(
    Number(withdrawal.totalAmount ?? addMoney(withdrawal.amount, withdrawal.fee || 0))
  );
  const refundReceipt =
    status === 'বাতিল'
      ? await signRewardReceipt({
          action: 'admin_adjust',
          amount: expectedRefund,
        })
      : null;

  try {
    await runTransaction(db, async (tx) => {
      const wdSnap = await tx.get(wdRef);
      if (!wdSnap.exists()) throw new Error('উত্তোলন অনুরোধ পাওয়া যায়নি');
      const currentWd = wdSnap.data() as {
        status?: string;
        amount?: number;
        totalAmount?: number;
        method?: string;
      };
      if (currentWd.status !== 'প্রসেসিং') {
        throw new Error('এই উত্তোলন অনুরোধটি ইতিমধ্যেই প্রসেস করা হয়েছে');
      }

      if (status === 'সম্পন্ন') {
        tx.update(wdRef, {
          status: 'সম্পন্ন',
          updatedAt: serverTimestamp(),
        });
        return;
      }

      const refundAmount = roundMoney(
        Number(currentWd.totalAmount ?? currentWd.amount ?? expectedRefund)
      );
      const userSnap = await tx.get(userRef);

      tx.update(wdRef, {
        status: 'বাতিল',
        updatedAt: serverTimestamp(),
      });

      if (userSnap.exists() && refundReceipt) {
        const u = userSnap.data() as UserAccount;
        const nextBalance = addMoney(u.balance || 0, refundAmount);
        tx.update(userRef, {
          balance: nextBalance,
          updatedAt: serverTimestamp(),
        });
        tx.set(doc(db, 'users', withdrawal.userId, 'transactions', makeDocId('tx')), {
          userId: withdrawal.userId,
          type: 'in',
          amount: refundAmount,
          title: `উত্তোলন বাতিল ও রিফান্ড (${currentWd.method || withdrawal.method})`,
          icon: '↩️',
          receiptId: refundReceipt.receiptId,
          receiptSignature: refundReceipt.receiptSignature,
          createdAt: serverTimestamp(),
        });
      }
    });
    void notifyTelegramEvent({
      type: 'withdrawal_status',
      targetUid: withdrawal.userId,
      userName: withdrawal.userName,
      method: withdrawal.method,
      amount: roundMoney(withdrawal.amount),
      status,
    });
  } catch (err) {
    if (err instanceof Error && (err.message.includes('ইতিমধ্যেই প্রসেস') || err.message.includes('পাওয়া যায়নি'))) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `withdrawals/${withdrawal.id}`);
  }
}


export async function adminDecryptWithdrawalNumber(
  encryptedAccount: string,
  ownerUid: string
): Promise<string> {
  return decryptFieldOnServer(encryptedAccount, ownerUid);
}

export async function adminDecryptSubmissionCredentials(
  encryptedCredentials: string,
  ownerUid: string
): Promise<{ identifier: string; password: string; note?: string }> {
  const plain = await decryptFieldOnServer(encryptedCredentials, ownerUid);
  try {
    const parsed = JSON.parse(plain) as { identifier?: string; password?: string; note?: string };
    return {
      identifier: String(parsed.identifier || ''),
      password: String(parsed.password || ''),
      note: parsed.note ? String(parsed.note) : '',
    };
  } catch {
    return { identifier: plain, password: '' };
  }
}

export async function adminReviewAccountSubmission(
  submission: AccountSubmissionRecord,
  decision: 'এপ্রুভড' | 'রিজেক্টেড',
  adminNote?: string
): Promise<void> {
  const cleanNote = adminNote?.trim() ? adminNote.trim().slice(0, 200) : null;
  const subRef = doc(db, 'accountSubmissions', submission.id);
  const userRef = doc(db, 'users', submission.userId);

  const approveReceipt =
    decision === 'এপ্রুভড'
      ? await signRewardReceipt({
          action: 'account_approve',
          amount: roundMoney(submission.amount),
          platform: submission.platform,
        })
      : null;

  try {
    await runTransaction(db, async (tx) => {
      const subSnap = await tx.get(subRef);
      if (!subSnap.exists()) throw new Error('সাবমিশন পাওয়া যায়নি');
      const currentSub = subSnap.data() as { status?: string; amount?: number; platform?: AccountPlatform; maskedIdentifier?: string };
      if (currentSub.status !== 'পেন্ডিং') {
        throw new Error('এই সাবমিশনটি ইতিমধ্যেই রিভিউ করা হয়েছে');
      }

      if (decision === 'রিজেক্টেড') {
        tx.update(subRef, {
          status: 'রিজেক্টেড',
          adminNote: cleanNote,
          updatedAt: serverTimestamp(),
        });
        return;
      }

      const creditAmount = roundMoney(Number(currentSub.amount || submission.amount));
      const userSnap = await tx.get(userRef);

      tx.update(subRef, {
        status: 'এপ্রুভড',
        adminNote: cleanNote,
        updatedAt: serverTimestamp(),
      });

      if (userSnap.exists() && approveReceipt) {
        const u = userSnap.data() as UserAccount;
        const today = todayKey();
        const nextWallet = computeNextWalletState(u.balance, u.totalEarned, creditAmount);
        const dailyEarn = addMoney(u.dailyDate === today ? Number(u.dailyTodayEarn || 0) : 0, creditAmount);
        tx.update(userRef, {
          balance: nextWallet.balance,
          totalEarned: nextWallet.totalEarned,
          dailyDate: today,
          dailyTodayEarn: dailyEarn,
          updatedAt: serverTimestamp(),
        });
        const platform = currentSub.platform || submission.platform;
        const platformLabel = platform === 'gmail' ? 'জিমেইল সেল' : 'ফেসবুক সেল';
        tx.set(doc(db, 'users', submission.userId, 'transactions', makeDocId('tx')), {
          userId: submission.userId,
          type: 'in',
          amount: creditAmount,
          title: `${platformLabel} এপ্রুভড (${currentSub.maskedIdentifier || submission.maskedIdentifier})`,
          icon: platform === 'gmail' ? '📧' : '📘',
          receiptId: approveReceipt.receiptId,
          receiptSignature: approveReceipt.receiptSignature,
          createdAt: serverTimestamp(),
        });
      }
    });
    void notifyTelegramEvent({
      type: 'account_approved',
      targetUid: submission.userId,
      userName: submission.userName,
      platform: submission.platform,
      maskedIdentifier: submission.maskedIdentifier,
      amount: roundMoney(submission.amount),
      status: decision,
      note: cleanNote || undefined,
    });
  } catch (err) {
    if (err instanceof Error && (err.message.includes('ইতিমধ্যেই রিভিউ') || err.message.includes('পাওয়া যায়নি'))) {
      throw err;
    }
    handleFirestoreError(err, OperationType.WRITE, `accountSubmissions/${submission.id}`);
  }
}

export function subscribeUserAccount(
  uid: string,
  onAccount: (account: UserAccount) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (snap.exists()) {
        onAccount(snap.data() as UserAccount);
      }
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export async function adminSetUserSuspension(
  targetUid: string,
  suspended: boolean,
  reason?: string
): Promise<void> {
  const cleanReason = suspended && reason?.trim() ? reason.trim().slice(0, 240) : null;
  const userRef = doc(db, 'users', targetUid);

  try {
    await updateDoc(userRef, {
      suspended,
      suspensionReason: cleanReason,
      suspendedAt: suspended ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${targetUid}`);
  }

  // Keep existing support thread suspension flag synced if a thread exists
  try {
    const threadRef = doc(db, 'supportThreads', targetUid);
    const threadSnap = await getDoc(threadRef);
    if (threadSnap.exists()) {
      const existingData = threadSnap.data();
      await updateDoc(threadRef, {
        userSuspended: suspended,
        unreadByAdmin: Number(existingData.unreadByAdmin || 0),
        updatedAt: serverTimestamp(),
      });
    }
  } catch {
    // Non-fatal if thread doesn't exist
  }
}

function mapSupportThread(id: string, data: Record<string, unknown>): SupportThreadRecord {
  const ms = timestampToMs(data.updatedAt);
  return {
    id,
    userId: String(data.userId || id),
    userName: String(data.userName || 'ব্যবহারকারী'),
    userRefCode: String(data.userRefCode || 'TK0000'),
    userSuspended: Boolean(data.userSuspended),
    lastMessage: String(data.lastMessage || ''),
    lastSender: data.lastSender === 'admin' ? 'admin' : 'user',
    unreadByAdmin: Number(data.unreadByAdmin || 0),
    unreadByUser: Number(data.unreadByUser || 0),
    updatedAtMs: ms,
    dateLabel: formatBnDate(new Date(ms)),
  };
}

export function subscribeUserSupportThread(
  uid: string,
  onThread: (thread: SupportThreadRecord | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'supportThreads', uid),
    (snap) => {
      if (!snap.exists()) {
        onThread(null);
      } else {
        onThread(mapSupportThread(snap.id, snap.data() as Record<string, unknown>));
      }
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export function subscribeAdminSupportThreads(
  onThreads: (threads: SupportThreadRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'supportThreads'), limit(100)),
    (snap) => {
      const mapped = snap.docs.map((d) =>
        mapSupportThread(d.id, d.data() as Record<string, unknown>)
      );
      onThreads(sortSupportThreads(mapped));
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export function subscribeSupportMessages(
  threadUid: string,
  onMessages: (messages: SupportMessageRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'supportThreads', threadUid, 'messages'),
      where('threadId', '==', threadUid),
      limit(150)
    ),
    (snap) => {
      const list: SupportMessageRecord[] = snap.docs
        .map((d) => {
          const data = d.data();
          const ms = timestampToMs(data.createdAt);
          return {
            id: d.id,
            threadId: String(data.threadId || threadUid),
            senderId: String(data.senderId || ''),
            senderRole: data.senderRole === 'admin' ? ('admin' as const) : ('user' as const),
            senderName: String(data.senderName || ''),
            text: String(data.text || ''),
            createdAtMs: ms,
            dateLabel: formatBnDate(new Date(ms)),
          };
        })
        .sort((a, b) => a.createdAtMs - b.createdAtMs);
      onMessages(list);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export async function sendSupportMessage(params: {
  threadUid: string;
  userName: string;
  userRefCode: string;
  userSuspended: boolean;
  senderUid: string;
  senderName: string;
  senderRole: 'user' | 'admin';
  text: string;
}): Promise<void> {
  const cleanText = params.text.trim().slice(0, 1000);
  if (!cleanText) throw new Error('মেসেজ লিখুন');

  const threadRef = doc(db, 'supportThreads', params.threadUid);
  const msgId = makeDocId('msg');
  const msgRef = doc(db, 'supportThreads', params.threadUid, 'messages', msgId);

  let existingSnap;
  try {
    existingSnap = await getDoc(threadRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `supportThreads/${params.threadUid}`);
  }

  const batch = writeBatch(db);
  const preview = cleanText.slice(0, 500);
  const safeUserName = (params.userName || 'ব্যবহারকারী').trim().slice(0, 80) || 'ব্যবহারকারী';
  const safeSenderName = (params.senderName || 'সাপোর্ট').trim().slice(0, 80) || 'সাপোর্ট';
  const safeRefCode =
    params.userRefCode && /^[A-Z0-9_-]{4,24}$/.test(params.userRefCode)
      ? params.userRefCode
      : 'TKUSER00';

  if (!existingSnap.exists()) {
    batch.set(threadRef, {
      userId: params.threadUid,
      userName: safeUserName,
      userRefCode: safeRefCode,
      userSuspended: Boolean(params.userSuspended),
      lastMessage: preview,
      lastSender: params.senderRole,
      unreadByAdmin: params.senderRole === 'user' ? 1 : 0,
      unreadByUser: params.senderRole === 'admin' ? 1 : 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    const prev = existingSnap.data();
    if (params.senderRole === 'user') {
      batch.update(threadRef, {
        userName: safeUserName,
        userSuspended: Boolean(params.userSuspended),
        lastMessage: preview,
        lastSender: 'user',
        unreadByAdmin: Number(prev.unreadByAdmin || 0) + 1,
        unreadByUser: 0,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(threadRef, {
        userSuspended: Boolean(params.userSuspended),
        lastMessage: preview,
        lastSender: 'admin',
        unreadByAdmin: 0,
        unreadByUser: Number(prev.unreadByUser || 0) + 1,
        updatedAt: serverTimestamp(),
      });
    }
  }

  batch.set(msgRef, {
    threadId: params.threadUid,
    senderId: params.senderUid,
    senderRole: params.senderRole,
    senderName: safeSenderName,
    text: cleanText,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `supportThreads/${params.threadUid}/messages/${msgId}`);
  }

  if (params.senderRole === 'user') {
    await notifyTelegramEvent({
      type: 'support_message',
      userName: safeUserName,
      refCode: safeRefCode,
      userSuspended: Boolean(params.userSuspended),
      text: cleanText,
    });
  }
}

export async function markSupportThreadRead(
  threadUid: string,
  readerRole: 'user' | 'admin'
): Promise<void> {
  const threadRef = doc(db, 'supportThreads', threadUid);
  try {
    const snap = await getDoc(threadRef);
    if (!snap.exists()) return;
    if (readerRole === 'user') {
      if (Number(snap.data().unreadByUser || 0) === 0) return;
      await updateDoc(threadRef, {
        unreadByUser: 0,
        updatedAt: serverTimestamp(),
      });
    } else {
      if (Number(snap.data().unreadByAdmin || 0) === 0) return;
      await updateDoc(threadRef, {
        unreadByAdmin: 0,
        updatedAt: serverTimestamp(),
      });
    }
  } catch {
    // Silent read-receipt error ignored
  }
}
