import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  Check,
  CheckCircle2,
  Copy,
  LogOut,
  Mail,
  MessageCircle,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Unlock,
  X,
} from 'lucide-react';
import {
  adminAdjustUserBalance,
  adminDecryptSubmissionCredentials,
  adminDecryptWithdrawalNumber,
  adminReviewAccountSubmission,
  adminSaveAccountSellSettings,
  adminSaveReferralSettings,
  adminSaveWithdrawalSettings,
  adminSetUserSuspension,
  adminUpdateWithdrawalStatus,
  fetchAdminDashboardData,
  fetchUserActivity,
  subscribeAdminSupportThreads,
  type AccountSubmissionRecord,
  type AdminDashboardData,
  type SupportThreadRecord,
  type TransactionRecord,
  type UserAccount,
  type WithdrawalRecord,
} from '../services/firestoreService';
import { fetchAdminSecurityStatus, type AdminSecurityStatus } from '../services/secureApi';
import {
  calculateWithdrawalTotal,
  DEFAULT_ACCOUNT_SELL_SETTINGS,
  DEFAULT_REFERRAL_SETTINGS,
  DEFAULT_WITHDRAWAL_SETTINGS,
  filterAccountSubmissionsByStatus,
  filterAdminTransactions,
  filterUsersByStatusAndQuery,
  filterWithdrawalsByStatus,
  fmtAmount,
  fmtBnReward,
  toBn,
  validateAdminBalanceDelta,
  validateReferralSettings,
  validateTaskSellSettings,
  validateWithdrawalSettings,
  WITHDRAWAL_FEE_PRESETS,
  type AccountSellSettingsConfig,
  type AccountSubmissionStatus,
  type ReferralSettingsConfig,
  type WithdrawalSettingsConfig,
  type WithdrawalStatus,
} from '../utils/takadearLogic';
import { Modal } from './Modal';
import { BkashLogo } from './BkashLogo';
import { FacebookLogo } from './FacebookLogo';
import { LiveSupportChat } from './LiveSupportChat';

interface AdminViewProps {
  adminUid: string;
  adminName: string;
  onBack: () => void;
  onLogout?: () => Promise<void>;
  onToast: (msg: string, variant?: 'default' | 'ok' | 'err' | 'gold') => void;
}

type AdminTab = 'overview' | 'tasks' | 'submissions' | 'users' | 'support' | 'tx' | 'withdraw';

export const AdminView: React.FC<AdminViewProps> = ({
  adminUid,
  adminName,
  onBack,
  onLogout,
  onToast,
}) => {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [securityStatus, setSecurityStatus] = useState<AdminSecurityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(false);

  const [search, setSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [txSearch, setTxSearch] = useState('');
  const [txFilter, setTxFilter] = useState<'all' | 'in' | 'out'>('all');
  const [wdFilter, setWdFilter] = useState<'all' | WithdrawalStatus>('all');
  const [subFilter, setSubFilter] = useState<'all' | AccountSubmissionStatus>('all');

  const [sellForm, setSellForm] = useState<AccountSellSettingsConfig>({
    ...DEFAULT_ACCOUNT_SELL_SETTINGS,
  });
  const [referralForm, setReferralForm] = useState<ReferralSettingsConfig>({
    ...DEFAULT_REFERRAL_SETTINGS,
  });
  const [withdrawalFeeForm, setWithdrawalFeeForm] = useState<WithdrawalSettingsConfig>({
    ...DEFAULT_WITHDRAWAL_SETTINGS,
  });
  const [decryptedSubs, setDecryptedSubs] = useState<
    Record<string, { identifier: string; password: string; note?: string }>
  >({});
  const [rejectTarget, setRejectTarget] = useState<AccountSubmissionRecord | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const [selectedUserUid, setSelectedUserUid] = useState<string | null>(null);
  const [selectedUserTxs, setSelectedUserTxs] = useState<TransactionRecord[]>([]);
  const [selectedUserTxsLoading, setSelectedUserTxsLoading] = useState(false);
  const [adjustUser, setAdjustUser] = useState<UserAccount | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('100');
  const [adjustType, setAdjustType] = useState<'credit' | 'debit'>('credit');
  const [adjustNote, setAdjustNote] = useState('');
  const [decryptedNumbers, setDecryptedNumbers] = useState<Record<string, string>>({});

  const [suspendTarget, setSuspendTarget] = useState<UserAccount | null>(null);
  const [suspendReason, setSuspendReason] = useState('');

  const [supportThreads, setSupportThreads] = useState<SupportThreadRecord[]>([]);
  const [activeSupportThreadUid, setActiveSupportThreadUid] = useState<string | null>(null);
  const [adHocSupportUser, setAdHocSupportUser] = useState<UserAccount | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboardRes, secRes] = await Promise.all([
        fetchAdminDashboardData(),
        fetchAdminSecurityStatus().catch(() => null),
      ]);
      setData(dashboardRes);
      setSellForm(dashboardRes.accountSellSettings);
      setReferralForm(dashboardRes.referralSettings);
      setWithdrawalFeeForm(dashboardRes.withdrawalSettings);
      if (secRes) setSecurityStatus(secRes);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'অ্যাডমিন ডেটা লোড ব্যর্থ', 'err');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const unsub = subscribeAdminSupportThreads(
      (threads) => {
        setSupportThreads(threads);
      },
      (err) => {
        onToast(err.message || 'লাইভ সাপোর্ট লোড ব্যর্থ', 'err');
      }
    );
    return () => unsub();
  }, [onToast]);

  const loadSelectedUserActivity = useCallback(async (uid: string) => {
    setSelectedUserTxsLoading(true);
    try {
      const activity = await fetchUserActivity(uid);
      setSelectedUserTxs(activity.transactions.slice(0, 6));
    } catch {
      setSelectedUserTxs([]);
    } finally {
      setSelectedUserTxsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedUserUid) {
      setSelectedUserTxs([]);
      return;
    }
    void loadSelectedUserActivity(selectedUserUid);
  }, [selectedUserUid, loadSelectedUserActivity]);

  const handleAdjust = async (uid: string, delta: number, customNote?: string) => {
    setBusyAction(true);
    try {
      await adminAdjustUserBalance(uid, delta, customNote);
      onToast(`${delta >= 0 ? '+' : ''}৳${Math.abs(delta)} আপডেট সম্পন্ন`, 'ok');
      await load();
      if (selectedUserUid === uid) {
        void loadSelectedUserActivity(uid);
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'ব্যালেন্স আপডেট ব্যর্থ হয়েছে', 'err');
    } finally {
      setBusyAction(false);
    }
  };

  const handleCustomAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustUser) return;
    const rawVal = Number(adjustAmount);
    const delta = adjustType === 'credit' ? rawVal : -rawVal;
    const errMsg = validateAdminBalanceDelta(adjustUser.balance, delta);
    if (errMsg) {
      onToast(errMsg, 'err');
      return;
    }
    await handleAdjust(adjustUser.uid, delta, adjustNote);
    setAdjustUser(null);
    setAdjustAmount('100');
    setAdjustNote('');
  };

  const handleWithdrawalAction = async (
    withdrawal: WithdrawalRecord,
    status: 'সম্পন্ন' | 'বাতিল'
  ) => {
    setBusyAction(true);
    try {
      await adminUpdateWithdrawalStatus(withdrawal, status);
      onToast(
        status === 'বাতিল'
          ? 'উত্তোলন বাতিল ও ব্যবহারকারীর ব্যালেন্স রিফান্ড হয়েছে'
          : 'উত্তোলন সম্পন্ন চিহ্নিত হয়েছে',
        'ok'
      );
      await load();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'স্ট্যাটাস আপডেট ব্যর্থ', 'err');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDecryptNumber = async (wdId: string, encrypted: string, ownerUid: string) => {
    try {
      const plain = await adminDecryptWithdrawalNumber(encrypted, ownerUid);
      setDecryptedNumbers((prev) => ({ ...prev, [wdId]: plain }));
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'ডিক্রিপশন ব্যর্থ', 'err');
    }
  };


  const handleSaveSellSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateTaskSellSettings(sellForm);
    if (err) {
      onToast(err, 'err');
      return;
    }
    setBusyAction(true);
    try {
      await adminSaveAccountSellSettings(sellForm);
      onToast('জিমেইল ও ফেসবুক সেলের দাম ও পাসওয়ার্ড সেভ হয়েছে', 'ok');
      await load();
    } catch (saveErr) {
      onToast(saveErr instanceof Error ? saveErr.message : 'সেভ করা যায়নি', 'err');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveReferralSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateReferralSettings(referralForm);
    if (err) {
      onToast(err, 'err');
      return;
    }
    setBusyAction(true);
    try {
      await adminSaveReferralSettings(referralForm);
      onToast('রেফারেল বোনাস ও শর্তাবলি সেভ হয়েছে', 'ok');
      await load();
    } catch (saveErr) {
      onToast(saveErr instanceof Error ? saveErr.message : 'রেফারেল সেটিংস সেভ করা যায়নি', 'err');
    } finally {
      setBusyAction(false);
    }
  };

  const handleSaveWithdrawalSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateWithdrawalSettings(withdrawalFeeForm);
    if (err) {
      onToast(err, 'err');
      return;
    }
    setBusyAction(true);
    try {
      await adminSaveWithdrawalSettings(withdrawalFeeForm);
      onToast('বিকাশ উইথড্র ফি সেটিংস সেভ হয়েছে', 'ok');
      await load();
    } catch (saveErr) {
      onToast(saveErr instanceof Error ? saveErr.message : 'উইথড্র ফি সেভ করা যায়নি', 'err');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDecryptSub = async (sub: AccountSubmissionRecord) => {
    try {
      const creds = await adminDecryptSubmissionCredentials(
        sub.encryptedCredentials,
        sub.userId
      );
      setDecryptedSubs((prev) => ({ ...prev, [sub.id]: creds }));
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'ডিক্রিপশন ব্যর্থ', 'err');
    }
  };

  const handleApproveSubmission = async (sub: AccountSubmissionRecord) => {
    setBusyAction(true);
    try {
      await adminReviewAccountSubmission(sub, 'এপ্রুভড');
      onToast(`${sub.userName}-এর অ্যাকাউন্ট এপ্রুভ ও +৳${sub.amount} যোগ হয়েছে`, 'ok');
      await load();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'এপ্রুভ করতে সমস্যা হয়েছে', 'err');
    } finally {
      setBusyAction(false);
    }
  };

  const handleRejectSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    setBusyAction(true);
    try {
      await adminReviewAccountSubmission(rejectTarget, 'রিজেক্টেড', rejectNote);
      onToast('সাবমিশন রিজেক্ট করা হয়েছে (কোনো টাকা যোগ হয়নি)', 'gold');
      setRejectTarget(null);
      setRejectNote('');
      await load();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'রিজেক্ট করতে সমস্যা হয়েছে', 'err');
    } finally {
      setBusyAction(false);
    }
  };

  const handleConfirmSuspend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suspendTarget) return;
    setBusyAction(true);
    try {
      await adminSetUserSuspension(suspendTarget.uid, true, suspendReason);
      onToast(`${suspendTarget.name}-এর অ্যাকাউন্ট সাসপেন্ড করা হয়েছে`, 'gold');
      setSuspendTarget(null);
      setSuspendReason('');
      await load();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'সাসপেন্ড করতে সমস্যা হয়েছে', 'err');
    } finally {
      setBusyAction(false);
    }
  };

  const handleUnsuspend = async (user: UserAccount) => {
    setBusyAction(true);
    try {
      await adminSetUserSuspension(user.uid, false);
      onToast(`${user.name}-এর অ্যাকাউন্ট পুনরায় সচল করা হয়েছে`, 'ok');
      await load();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'অ্যাক্টিভ করতে সমস্যা হয়েছে', 'err');
    } finally {
      setBusyAction(false);
    }
  };

  const users = data?.users || [];
  const selectedUser = selectedUserUid ? users.find((u) => u.uid === selectedUserUid) || null : null;
  const withdrawals = data?.withdrawals || [];
  const txs = data?.recentTransactions || [];
  const submissions = data?.submissions || [];

  const pendingWithdrawals = withdrawals.filter((w) => w.status === 'প্রসেসিং');
  const pendingSubmissions = submissions.filter((s) => s.status === 'পেন্ডিং');
  const suspendedUsersCount = users.filter((u) => Boolean(u.suspended)).length;
  const totalUnreadSupport = supportThreads.reduce((s, t) => s + (t.unreadByAdmin || 0), 0);
  const totalBal = users.reduce((s, u) => s + (u.balance || 0), 0);
  const totalEarn = users.reduce((s, u) => s + (u.totalEarned || 0), 0);
  const totalWd = withdrawals
    .filter((w) => w.status !== 'বাতিল')
    .reduce((s, w) => s + (w.amount || 0), 0);

  const filteredUsers = filterUsersByStatusAndQuery(users, userStatusFilter, search);

  const filteredWithdrawals = filterWithdrawalsByStatus(withdrawals, wdFilter);
  const filteredTransactions = filterAdminTransactions(txs, txFilter, txSearch);
  const filteredSubmissions = filterAccountSubmissionsByStatus(submissions, subFilter);

  const selectedSupportThread =
    supportThreads.find((t) => t.userId === activeSupportThreadUid) ||
    (adHocSupportUser
      ? {
          id: adHocSupportUser.uid,
          userId: adHocSupportUser.uid,
          userName: adHocSupportUser.name,
          userRefCode: adHocSupportUser.refCode,
          userSuspended: Boolean(adHocSupportUser.suspended),
          lastMessage: '',
          lastSender: 'admin' as const,
          unreadByAdmin: 0,
          unreadByUser: 0,
          updatedAtMs: Date.now(),
          dateLabel: '',
        }
      : supportThreads[0] || null);

  return (
    <div className="min-h-screen w-full bg-[var(--bg)] text-[var(--text)]">
      <header className="sticky top-0 z-30 bg-[var(--surface)]/95 backdrop-blur-md border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>ফিরে যান</span>
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-bold truncate">অ্যাডমিন কন্ট্রোল প্যানেল</h1>
              <p className="text-xs text-[var(--muted)] truncate">
                {toBn(users.length)} ব্যবহারকারী · {toBn(pendingSubmissions.length)} পেন্ডিং সেল · {toBn(pendingWithdrawals.length)} উত্তোলন
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={loading}
              onClick={() => void load()}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-semibold cursor-pointer whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>রিফ্রেশ</span>
            </button>
            {onLogout && (
              <button
                type="button"
                onClick={() => void onLogout()}
                className="min-h-[40px] px-3 py-2 rounded-xl bg-rose-500/15 text-[var(--danger)] text-xs font-semibold cursor-pointer whitespace-nowrap flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>লগআউট</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div
          role="tablist"
          aria-label="অ্যাডমিন সেকশন"
          className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] overflow-x-auto"
        >
          {(
            [
              ['overview', 'ওভারভিউ'],
              ['tasks', 'রেফারেল কন্ট্রোল'],
              ['submissions', `অ্যাকাউন্ট সেল (${toBn(pendingSubmissions.length)})`],
              ['users', `ব্যবহারকারী (${toBn(users.length)})`],
              [
                'support',
                totalUnreadSupport > 0
                  ? `লাইভ সাপোর্ট (${toBn(totalUnreadSupport)} নতুন)`
                  : `লাইভ সাপোর্ট (${toBn(supportThreads.length)})`,
              ],
              ['tx', `লেনদেন (${toBn(txs.length)})`],
              ['withdraw', `উত্তোলন (${toBn(pendingWithdrawals.length)})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`min-h-[42px] px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                tab === id
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading && !data ? (
          <div className="p-12 rounded-3xl bg-[var(--surface)] border border-[var(--border)] text-center text-sm text-[var(--muted)]">
            অ্যাডমিন ডেটা লোড হচ্ছে...
          </div>
        ) : null}

        {tab === 'overview' && data && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5">
                <p className="text-xs text-[var(--muted)]">মোট ব্যবহারকারী</p>
                <p className="text-2xl font-bold font-mono-num mt-1">{toBn(users.length)}</p>
              </div>
              <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5">
                <p className="text-xs text-[var(--muted)]">মোট ব্যালেন্স</p>
                <p className="text-2xl font-bold font-mono-num mt-1 text-[var(--emerald)]">
                  ৳{toBn(Math.round(totalBal))}
                </p>
              </div>
              <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5">
                <p className="text-xs text-[var(--muted)]">মোট আয়</p>
                <p className="text-2xl font-bold font-mono-num mt-1 text-[var(--primary)]">
                  ৳{toBn(Math.round(totalEarn))}
                </p>
              </div>
              <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5">
                <p className="text-xs text-[var(--muted)]">মোট উত্তোলন (অপেক্ষমাণ: {toBn(pendingWithdrawals.length)})</p>
                <p className="text-2xl font-bold font-mono-num mt-1 text-[var(--gold)]">
                  ৳{toBn(Math.round(totalWd))}
                </p>
              </div>
            </div>

            {pendingSubmissions.length > 0 && (
              <section className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold">অপেক্ষমাণ জিমেইল ও ফেসবুক সেল</h2>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    মোট {toBn(pendingSubmissions.length)}টি অ্যাকাউন্ট রিভিউ ও এপ্রুভালের জন্য অপেক্ষমাণ
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSubFilter('পেন্ডিং');
                    setTab('submissions');
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  রিভিউ করুন ›
                </button>
              </section>
            )}

            {securityStatus && (
              <section className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6">
                <div className="flex items-center gap-2.5 mb-4">
                  <ShieldCheck className="w-5 h-5 text-[var(--emerald)]" />
                  <h2 className="text-base font-bold">সিস্টেম সিকিউরিটি ও এনক্রিপশন স্ট্যাটাস</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                    <p className="text-[var(--muted)]">অ্যাডমিন সেশন</p>
                    <p className="font-semibold font-mono-num mt-1 truncate">{securityStatus.adminEmail}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                    <p className="text-[var(--muted)]">Firebase প্রজেক্ট</p>
                    <p className="font-semibold font-mono-num mt-1 truncate">{securityStatus.projectId}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
                    <p className="text-[var(--muted)]">এনক্রিপশন ও সিগনেচার</p>
                    <p className="font-semibold font-mono-num mt-1 text-[var(--emerald)]">
                      {securityStatus.encryptionAlgorithm} · {securityStatus.signatureAlgorithm}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {pendingWithdrawals.length > 0 && (
              <section className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold">অপেক্ষমাণ উত্তোলনের অনুরোধ</h2>
                  <button
                    type="button"
                    onClick={() => {
                      setWdFilter('প্রসেসিং');
                      setTab('withdraw');
                    }}
                    className="text-xs font-semibold text-[var(--primary)] cursor-pointer"
                  >
                    সবগুলো দেখুন ›
                  </button>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {pendingWithdrawals.slice(0, 5).map((w) => {
                    const decrypted = decryptedNumbers[w.id];
                    const wdFee = Number(w.fee || 0);
                    const wdTotal = Number(w.totalAmount ?? w.amount + wdFee);
                    return (
                      <div key={w.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {w.method === 'bKash' && <BkashLogo className="w-7 h-7 shrink-0" />}
                          <div className="min-w-0">
                            <p className="text-sm font-bold">
                              {w.userName} · {w.method} ·{' '}
                              <span className="font-mono-num text-[var(--primary)]">
                                {decrypted || w.maskedNumber}
                              </span>
                            </p>
                            <p className="text-xs text-[var(--muted)] font-mono-num">
                              ৳{fmtAmount(w.amount)}
                              {wdFee > 0 ? ` (+ফি ৳${fmtAmount(wdFee)} = মোট ৳${fmtAmount(wdTotal)})` : ''} · {w.dateLabel}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          {!decrypted && (
                            <button
                              type="button"
                              onClick={() => handleDecryptNumber(w.id, w.encryptedAccount, w.userId)}
                              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                              <span>ডিক্রিপ্ট</span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() => handleWithdrawalAction(w, 'সম্পন্ন')}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-500/15 text-[var(--emerald)] text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>সম্পন্ন</span>
                          </button>
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() => handleWithdrawalAction(w, 'বাতিল')}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-rose-500/15 text-[var(--danger)] text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>বাতিল</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6">
              <h2 className="text-base font-bold mb-3">সাম্প্রতিক লেনদেন</h2>
              {txs.length === 0 ? (
                <p className="text-sm text-[var(--muted)] py-6 text-center">কোনো লেনদেন নেই</p>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {txs.slice(0, 8).map((t) => (
                    <div key={t.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {t.userName} · {t.title}
                        </p>
                        <p className="text-xs text-[var(--muted)]">{t.dateLabel}</p>
                      </div>
                      <span
                        className={`text-sm font-bold font-mono-num ${
                          t.type === 'in' ? 'text-[var(--emerald)]' : 'text-[var(--danger)]'
                        }`}
                      >
                        {t.type === 'in' ? '+' : '-'}৳{fmtAmount(t.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {tab === 'submissions' && data && (
          <div className="space-y-6">
            {/* Admin Price & Password Control Form */}
            <form
              onSubmit={handleSaveSellSettings}
              className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 space-y-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold">জিমেইল ও ফেসবুক সেল কন্ট্রোল</h2>
                  <p className="text-xs text-[var(--muted)]">
                    এখান থেকে দাম ও নির্ধারিত পাসওয়ার্ড সেট করলে ইউজারদের টাস্ক পেজে সাথে সাথে আপডেট হবে
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={busyAction}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <Save className="w-4 h-4" />
                  <span>সেটিংস সেভ করুন</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Gmail Settings */}
                <div className="p-4 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <span>📧</span>
                      <span>জিমেইল সেল (Gmail)</span>
                    </h3>
                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sellForm.gmailEnabled}
                        onChange={(e) =>
                          setSellForm((prev) => ({ ...prev, gmailEnabled: e.target.checked }))
                        }
                        className="w-4 h-4 accent-[var(--primary)]"
                      />
                      <span>{sellForm.gmailEnabled ? 'চালু' : 'বন্ধ'}</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="cfg-gmail-price" className="block text-xs text-[var(--muted)] mb-1">
                        জিমেইলের দাম (৳)
                      </label>
                      <input
                        id="cfg-gmail-price"
                        type="number"
                        min="1"
                        max="100000"
                        value={sellForm.gmailPrice}
                        onChange={(e) =>
                          setSellForm((prev) => ({ ...prev, gmailPrice: Number(e.target.value) }))
                        }
                        className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm font-mono-num"
                      />
                    </div>
                    <div>
                      <label htmlFor="cfg-gmail-pass" className="block text-xs text-[var(--muted)] mb-1">
                        নির্ধারিত পাসওয়ার্ড
                      </label>
                      <input
                        id="cfg-gmail-pass"
                        type="text"
                        maxLength={120}
                        value={sellForm.gmailPassword}
                        onChange={(e) =>
                          setSellForm((prev) => ({ ...prev, gmailPassword: e.target.value }))
                        }
                        placeholder="যেমন: Taka@2026"
                        className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm font-mono-num"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="cfg-gmail-note" className="block text-xs text-[var(--muted)] mb-1">
                      ইউজারের জন্য নির্দেশনা
                    </label>
                    <input
                      id="cfg-gmail-note"
                      type="text"
                      maxLength={240}
                      value={sellForm.gmailNote}
                      onChange={(e) =>
                        setSellForm((prev) => ({ ...prev, gmailNote: e.target.value }))
                      }
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs"
                    />
                  </div>
                </div>

                {/* Facebook Settings */}
                <div className="p-4 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <FacebookLogo className="w-5 h-5" />
                      <span>ফেসবুক সেল (Facebook)</span>
                    </h3>
                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sellForm.facebookEnabled}
                        onChange={(e) =>
                          setSellForm((prev) => ({ ...prev, facebookEnabled: e.target.checked }))
                        }
                        className="w-4 h-4 accent-[var(--primary)]"
                      />
                      <span>{sellForm.facebookEnabled ? 'চালু' : 'বন্ধ'}</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="cfg-fb-price" className="block text-xs text-[var(--muted)] mb-1">
                        ফেসবুকের দাম (৳)
                      </label>
                      <input
                        id="cfg-fb-price"
                        type="number"
                        min="1"
                        max="100000"
                        value={sellForm.facebookPrice}
                        onChange={(e) =>
                          setSellForm((prev) => ({ ...prev, facebookPrice: Number(e.target.value) }))
                        }
                        className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm font-mono-num"
                      />
                    </div>
                    <div>
                      <label htmlFor="cfg-fb-pass" className="block text-xs text-[var(--muted)] mb-1">
                        নির্ধারিত পাসওয়ার্ড
                      </label>
                      <input
                        id="cfg-fb-pass"
                        type="text"
                        maxLength={120}
                        value={sellForm.facebookPassword}
                        onChange={(e) =>
                          setSellForm((prev) => ({ ...prev, facebookPassword: e.target.value }))
                        }
                        placeholder="যেমন: FbTaka@2026"
                        className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm font-mono-num"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="cfg-fb-note" className="block text-xs text-[var(--muted)] mb-1">
                      ইউজারের জন্য নির্দেশনা
                    </label>
                    <input
                      id="cfg-fb-note"
                      type="text"
                      maxLength={240}
                      value={sellForm.facebookNote}
                      onChange={(e) =>
                        setSellForm((prev) => ({ ...prev, facebookNote: e.target.value }))
                      }
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs"
                    />
                  </div>
                </div>
              </div>
            </form>

            {/* Submission Review List */}
            <div className="space-y-4">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] overflow-x-auto">
                {(
                  [
                    ['all', `সব (${toBn(submissions.length)})`],
                    ['পেন্ডিং', `পেন্ডিং (${toBn(pendingSubmissions.length)})`],
                    ['এপ্রুভড', `এপ্রুভড (${toBn(submissions.filter((s) => s.status === 'এপ্রুভড').length)})`],
                    ['রিজেক্টেড', `রিজেক্টেড (${toBn(submissions.filter((s) => s.status === 'রিজেক্টেড').length)})`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSubFilter(id)}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer ${
                      subFilter === id
                        ? 'bg-[var(--primary)] text-white'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
                {filteredSubmissions.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[var(--muted)]">
                    কোনো অ্যাকাউন্ট সাবমিশন পাওয়া যায়নি
                  </div>
                ) : (
                  filteredSubmissions.map((sub) => {
                    const creds = decryptedSubs[sub.id];
                    return (
                      <div key={sub.id} className="p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold flex items-center gap-1.5 flex-wrap">
                              {sub.platform === 'gmail' ? (
                                <span>📧 জিমেইল সেল</span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5">
                                  <FacebookLogo className="w-4 h-4 shrink-0" />
                                  <span>ফেসবুক সেল</span>
                                </span>
                              )}{' '}
                              · {sub.userName} ·{' '}
                              <span className="font-mono-num text-[var(--primary)]">
                                {creds ? creds.identifier : sub.maskedIdentifier}
                              </span>
                            </p>
                            <p className="text-xs text-[var(--muted)] mt-0.5">
                              {sub.dateLabel} · স্ট্যাটাস:{' '}
                              <strong
                                className={
                                  sub.status === 'এপ্রুভড'
                                    ? 'text-[var(--emerald)]'
                                    : sub.status === 'রিজেক্টেড'
                                      ? 'text-[var(--danger)]'
                                      : 'text-[var(--gold)]'
                                }
                              >
                                {sub.status}
                              </strong>{' '}
                              · পরিমাণ: <span className="font-mono-num">৳{fmtAmount(sub.amount)}</span>
                              {sub.adminNote ? ` · নোট: ${sub.adminNote}` : ''}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            {!creds && (
                              <button
                                type="button"
                                onClick={() => void handleDecryptSub(sub)}
                                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <Unlock className="w-3.5 h-3.5" />
                                <span>তথ্য দেখুন</span>
                              </button>
                            )}
                            {sub.status === 'পেন্ডিং' && (
                              <>
                                <button
                                  type="button"
                                  disabled={busyAction}
                                  onClick={() => void handleApproveSubmission(sub)}
                                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-emerald-500/15 text-[var(--emerald)] text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>এপ্রুভ (+৳{toBn(sub.amount)})</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={busyAction}
                                  onClick={() => {
                                    setRejectTarget(sub);
                                    setRejectNote('');
                                  }}
                                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-rose-500/15 text-[var(--danger)] text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>রিজেক্ট</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {creds && (
                          <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <span className="text-[var(--muted)] block">আইডি / ইমেইল</span>
                                <span className="font-mono-num font-bold break-all">{creds.identifier}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  void navigator.clipboard.writeText(creds.identifier);
                                  onToast('আইডি কপি হয়েছে', 'ok');
                                }}
                                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center gap-1 cursor-pointer shrink-0"
                              >
                                <Copy className="w-3 h-3" />
                                <span>কপি</span>
                              </button>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <span className="text-[var(--muted)] block">পাসওয়ার্ড</span>
                                <span className="font-mono-num font-bold break-all">{creds.password}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  void navigator.clipboard.writeText(creds.password);
                                  onToast('পাসওয়ার্ড কপি হয়েছে', 'ok');
                                }}
                                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center gap-1 cursor-pointer shrink-0"
                              >
                                <Copy className="w-3 h-3" />
                                <span>কপি</span>
                              </button>
                            </div>
                            {creds.note && (
                              <div className="sm:col-span-2 flex items-center justify-between gap-2 pt-2 border-t border-[var(--border)]">
                                <div className="min-w-0">
                                  <span className="text-[var(--muted)] block">
                                    {sub.platform === 'facebook' ? 'কুকিজ' : 'নোট'}
                                  </span>
                                  <span className="font-mono-num text-[var(--text)] break-all">
                                    {creds.note}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void navigator.clipboard.writeText(creds.note || '');
                                    onToast(
                                      sub.platform === 'facebook' ? 'কুকিজ কপি হয়েছে' : 'নোট কপি হয়েছে',
                                      'ok'
                                    );
                                  }}
                                  className="min-h-[32px] px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center gap-1 cursor-pointer shrink-0"
                                >
                                  <Copy className="w-3 h-3" />
                                  <span>কপি</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'tasks' && data && (
          <div className="space-y-6">
            {/* Referral Bonus & Conditions Form */}
            <form
              onSubmit={handleSaveReferralSettings}
              className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 space-y-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold">রেফারেল বোনাস ও শর্তাবলি কন্ট্রোল</h2>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    বন্ধুকে আমন্ত্রণ জানালে আপনি ও আপনার বন্ধু কত টাকা পাবেন এবং বোনাস আনলক হওয়ার শর্ত নির্ধারণ করুন
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={busyAction}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <Save className="w-4 h-4" />
                  <span>রেফারেল সেটিংস সেভ করুন</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="ref-referrer-bonus" className="block text-xs text-[var(--muted)] mb-1">
                    আপনি পাবেন / আমন্ত্রণকারী বোনাস (৳)
                  </label>
                  <input
                    id="ref-referrer-bonus"
                    type="number"
                    min="0.5"
                    max="100"
                    step="0.5"
                    value={referralForm.referrerBonus}
                    onChange={(e) =>
                      setReferralForm((prev) => ({
                        ...prev,
                        referrerBonus: Number(e.target.value),
                      }))
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono-num"
                  />
                </div>

                <div>
                  <label htmlFor="ref-friend-bonus" className="block text-xs text-[var(--muted)] mb-1">
                    আপনার বন্ধু পাবে (৳)
                  </label>
                  <input
                    id="ref-friend-bonus"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={referralForm.friendBonus}
                    onChange={(e) =>
                      setReferralForm((prev) => ({
                        ...prev,
                        friendBonus: Number(e.target.value),
                      }))
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono-num"
                  />
                </div>

                <div>
                  <label htmlFor="ref-min-tasks" className="block text-xs text-[var(--muted)] mb-1">
                    বন্ধুর ন্যূনতম চেক-ইন/কাজ শর্ত (০-১০)
                  </label>
                  <input
                    id="ref-min-tasks"
                    type="number"
                    min="0"
                    max="10"
                    step="1"
                    value={referralForm.minTasks}
                    onChange={(e) =>
                      setReferralForm((prev) => ({
                        ...prev,
                        minTasks: Math.max(0, Math.min(10, Math.round(Number(e.target.value) || 0))),
                      }))
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono-num"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="ref-condition-note" className="block text-xs text-[var(--muted)] mb-1">
                  রেফারেলের শর্তের বিবরণ (ইউজারের রেফারেল কার্ডে দেখাবে)
                </label>
                <textarea
                  id="ref-condition-note"
                  rows={2}
                  maxLength={300}
                  value={referralForm.conditionNote}
                  onChange={(e) =>
                    setReferralForm((prev) => ({ ...prev, conditionNote: e.target.value }))
                  }
                  placeholder="যেমন: বন্ধুকে রেজিস্ট্রেশনের সময় আপনার রেফারেল কোড ব্যবহার করে ন্যূনতম ১টি দৈনিক চেক-ইন বা কাজ সম্পন্ন করতে হবে।"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs focus:outline-none focus:border-[var(--primary)] resize-y"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--muted)]">
                প্রিভিউ: বন্ধুকে আমন্ত্রণ জানালে আপনি{' '}
                <strong className="text-[var(--emerald)] font-mono-num">
                  ৳{fmtBnReward(referralForm.referrerBonus)}
                </strong>{' '}
                পাবেন এবং আপনার বন্ধু{' '}
                <strong className="text-[var(--primary)] font-mono-num">
                  ৳{fmtBnReward(referralForm.friendBonus)}
                </strong>{' '}
                বোনাস পাবে (শর্ত: ন্যূনতম {toBn(referralForm.minTasks)}টি চেক-ইন/কাজ)।
              </div>
            </form>
          </div>
        )}

        {tab === 'users' && data && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[var(--muted)] absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="নাম, ইমেইল, রেফারেল কোড বা UID দিয়ে খুঁজুন..."
                  aria-label="নাম, ইমেইল, রেফারেল কোড বা UID দিয়ে ব্যবহারকারী খুঁজুন"
                  className="w-full min-h-[46px] pl-11 pr-4 py-2.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                />
              </div>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] shrink-0 overflow-x-auto">
                {(
                  [
                    ['all', `সব (${toBn(users.length)})`],
                    ['active', `সচল (${toBn(users.length - suspendedUsersCount)})`],
                    ['suspended', `সাসপেন্ডেড (${toBn(suspendedUsersCount)})`],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setUserStatusFilter(id)}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer ${
                      userStatusFilter === id
                        ? 'bg-[var(--primary)] text-white'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
              {filteredUsers.length === 0 ? (
                <div className="p-8 text-center text-sm text-[var(--muted)]">কোনো ব্যবহারকারী পাওয়া যায়নি</div>
              ) : (
                filteredUsers.map((u) => (
                  <div key={u.uid} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setSelectedUserUid(u.uid)}
                          className="text-sm font-bold truncate text-left hover:text-[var(--primary)] transition-colors cursor-pointer"
                        >
                          {u.name}
                        </button>
                        {u.role === 'admin' && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-[var(--gold)] text-[11px] font-bold">
                            অ্যাডমিন
                          </span>
                        )}
                        {u.suspended && (
                          <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-[var(--danger)] text-[11px] font-bold">
                            সাসপেন্ডেড
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--primary)] font-mono-num mt-0.5 flex items-center gap-1.5 truncate">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{u.email || u.emailMasked || 'ইমেইল যুক্ত নেই'}</span>
                      </p>
                      <p className="text-xs text-[var(--muted)] font-mono-num mt-0.5">
                        কোড: {u.refCode} · ব্যালেন্স: ৳{fmtAmount(u.balance)} · মোট আয়: ৳{fmtAmount(u.totalEarned)}
                      </p>
                      {u.suspended && u.suspensionReason && (
                        <p className="text-xs text-[var(--danger)] mt-0.5">
                          কারণ: {u.suspensionReason}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => handleAdjust(u.uid, 100)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-emerald-500/15 text-[var(--emerald)] text-xs font-bold cursor-pointer disabled:opacity-50"
                      >
                        +১০০৳
                      </button>
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => handleAdjust(u.uid, -50)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-rose-500/15 text-[var(--danger)] text-xs font-bold cursor-pointer disabled:opacity-50"
                      >
                        -৫০৳
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAdjustUser(u);
                          setAdjustType('credit');
                          setAdjustAmount('100');
                          setAdjustNote('');
                        }}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        <span>কাস্টম</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAdHocSupportUser(u);
                          setActiveSupportThreadUid(u.uid);
                          setTab('support');
                        }}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-[var(--primary)]" />
                        <span>মেসেজ</span>
                      </button>
                      {u.role !== 'admin' && u.uid !== adminUid && (
                        u.suspended ? (
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() => void handleUnsuspend(u)}
                            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-emerald-500/15 text-[var(--emerald)] text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>সচল করুন</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() => {
                              setSuspendTarget(u);
                              setSuspendReason('');
                            }}
                            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-rose-500/15 text-[var(--danger)] text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>সাসপেন্ড</span>
                          </button>
                        )
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUserUid(u.uid);
                        }}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs font-semibold cursor-pointer"
                      >
                        বিস্তারিত
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {tab === 'support' && data && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <section className="lg:col-span-4 rounded-3xl bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
              <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-[var(--primary)]" />
                  <span>সাপোর্ট ইনবক্স ({toBn(supportThreads.length)})</span>
                </h2>
                {totalUnreadSupport > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-[var(--primary)] text-white text-[11px] font-bold">
                    {toBn(totalUnreadSupport)} নতুন
                  </span>
                )}
              </div>
              {supportThreads.length === 0 && !adHocSupportUser ? (
                <div className="p-8 text-center text-xs text-[var(--muted)]">
                  এখনো কোনো ইউজার লাইভ সাপোর্টে মেসেজ পাঠায়নি। ব্যবহারকারী ট্যাব থেকেও যেকোনো ইউজারকে মেসেজ করতে পারবেন।
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)] max-h-[460px] overflow-y-auto">
                  {adHocSupportUser &&
                    !supportThreads.some((t) => t.userId === adHocSupportUser.uid) && (
                      <button
                        type="button"
                        onClick={() => setActiveSupportThreadUid(adHocSupportUser.uid)}
                        className="w-full text-left p-3.5 bg-[var(--primary)]/10 border-l-2 border-[var(--primary)] cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold truncate">{adHocSupportUser.name}</p>
                          <span className="text-[11px] text-[var(--primary)] font-semibold">নতুন</span>
                        </div>
                        <p className="text-xs text-[var(--muted)] mt-0.5">মেসেজ শুরু করুন...</p>
                      </button>
                    )}
                  {supportThreads.map((t) => {
                    const isActive = selectedSupportThread?.userId === t.userId;
                    return (
                      <button
                        key={t.userId}
                        type="button"
                        onClick={() => {
                          setAdHocSupportUser(null);
                          setActiveSupportThreadUid(t.userId);
                        }}
                        className={`w-full text-left p-3.5 transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[var(--primary)]/10 border-l-2 border-[var(--primary)]'
                            : 'hover:bg-[var(--surface-2)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-sm font-bold truncate">{t.userName}</p>
                            {t.userSuspended && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-[var(--danger)] text-[10px] font-bold shrink-0">
                                সাসপেন্ডেড
                              </span>
                            )}
                          </div>
                          {t.unreadByAdmin > 0 && (
                            <span className="px-1.5 py-0.5 rounded-md bg-[var(--primary)] text-white text-[10px] font-bold shrink-0">
                              {toBn(t.unreadByAdmin)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--muted)] truncate mt-1">
                          {t.lastSender === 'admin' ? 'আপনি: ' : ''}
                          {t.lastMessage}
                        </p>
                        <p className="text-[10px] text-[var(--muted)] mt-1 font-mono-num">
                          {t.userRefCode} · {t.dateLabel}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="lg:col-span-8 rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-5 space-y-4">
              {selectedSupportThread ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold">{selectedSupportThread.userName}</h3>
                        {selectedSupportThread.userSuspended ? (
                          <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-[var(--danger)] text-[11px] font-bold">
                            সাসপেন্ডেড অ্যাকাউন্ট
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-[var(--emerald)] text-[11px] font-bold">
                            সচল অ্যাকাউন্ট
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--muted)] font-mono-num mt-0.5">
                        কোড: {selectedSupportThread.userRefCode} · UID: {selectedSupportThread.userId}
                      </p>
                    </div>
                    {(() => {
                      const targetUserObj = users.find((u) => u.uid === selectedSupportThread.userId);
                      if (!targetUserObj || targetUserObj.role === 'admin' || targetUserObj.uid === adminUid) {
                        return null;
                      }
                      return targetUserObj.suspended ? (
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => void handleUnsuspend(targetUserObj)}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-500/15 text-[var(--emerald)] text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>অ্যাকাউন্ট সচল করুন</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => {
                            setSuspendTarget(targetUserObj);
                            setSuspendReason('');
                          }}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-rose-500/15 text-[var(--danger)] text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>সাসপেন্ড করুন</span>
                        </button>
                      );
                    })()}
                  </div>

                  <LiveSupportChat
                    threadUid={selectedSupportThread.userId}
                    userName={selectedSupportThread.userName}
                    userRefCode={selectedSupportThread.userRefCode}
                    userSuspended={selectedSupportThread.userSuspended}
                    viewerUid={adminUid}
                    viewerName={adminName || 'অ্যাডমিন'}
                    viewerRole="admin"
                    onToast={onToast}
                  />
                </>
              ) : (
                <div className="p-12 text-center text-sm text-[var(--muted)]">
                  মেসেজ দেখার জন্য বাম পাশ থেকে একটি কথোপকথন নির্বাচন করুন
                </div>
              )}
            </section>
          </div>
        )}

        {tab === 'tx' && data && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[var(--muted)] absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={txSearch}
                  onChange={(e) => setTxSearch(e.target.value)}
                  placeholder="নাম, বিবরণ বা রসিদ আইডি দিয়ে খুঁজুন..."
                  aria-label="লেনদেন খুঁজুন"
                  className="w-full min-h-[44px] pl-11 pr-4 py-2 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
                />
              </div>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] shrink-0">
                {(
                  [
                    ['all', 'সব'],
                    ['in', 'আয় (+)'],
                    ['out', 'ডেবিট (-)'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTxFilter(id)}
                    className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                      txFilter === id
                        ? 'bg-[var(--primary)] text-white'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
              {filteredTransactions.length === 0 ? (
                <div className="p-8 text-center text-sm text-[var(--muted)]">কোনো লেনদেন নেই</div>
              ) : (
                filteredTransactions.map((t) => (
                  <div key={t.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {t.userName} · {t.title}
                      </p>
                      <p className="text-xs text-[var(--muted)] font-mono-num">
                        {t.dateLabel} · {t.receiptId}
                      </p>
                    </div>
                    <span
                      className={`text-sm font-bold font-mono-num shrink-0 ${
                        t.type === 'in' ? 'text-[var(--emerald)]' : 'text-[var(--danger)]'
                      }`}
                    >
                      {t.type === 'in' ? '+' : '-'}৳{fmtAmount(t.amount)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {tab === 'withdraw' && data && (
          <div className="space-y-4">
            <form
              onSubmit={handleSaveWithdrawalSettings}
              className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <BkashLogo className="w-9 h-9 shrink-0" />
                  <div>
                    <h2 className="text-base font-bold">বিকাশ (bKash) উইথড্র ফি কন্ট্রোল</h2>
                    <p className="text-xs text-[var(--muted)]">
                      এখান থেকে উইথড্র ফি সিলেক্ট করলে ইউজারের উত্তোলনের পরিমাণের সাথে ফি যোগ হয়ে ওয়ালেট থেকে কাটবে
                    </p>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={busyAction}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#E2136E] hover:bg-[#c81060] text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <Save className="w-4 h-4" />
                  <span>ফি সেটিংস সেভ করুন</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] space-y-3">
                  <span className="block text-xs font-medium text-[var(--muted)]">ফি এর ধরন নির্বাচন করুন</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setWithdrawalFeeForm((prev) => ({
                          ...prev,
                          feeType: 'fixed',
                          feeValue: prev.feeType === 'fixed' ? prev.feeValue : 0,
                        }))
                      }
                      className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                        withdrawalFeeForm.feeType === 'fixed'
                          ? 'bg-[#E2136E]/15 border-[#E2136E] text-[#E2136E]'
                          : 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted)]'
                      }`}
                    >
                      নির্দিষ্ট টাকা (৳)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setWithdrawalFeeForm((prev) => ({
                          ...prev,
                          feeType: 'percent',
                          feeValue: prev.feeType === 'percent' ? prev.feeValue : 0,
                        }))
                      }
                      className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                        withdrawalFeeForm.feeType === 'percent'
                          ? 'bg-[#E2136E]/15 border-[#E2136E] text-[#E2136E]'
                          : 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted)]'
                      }`}
                    >
                      শতাংশ (%)
                    </button>
                  </div>

                  <div>
                    <span className="block text-xs font-medium text-[var(--muted)] mb-2">দ্রুত ফি সিলেক্ট করুন</span>
                    <div className="flex flex-wrap gap-2">
                      {WITHDRAWAL_FEE_PRESETS[withdrawalFeeForm.feeType].map((preset) => {
                        const active = Number(withdrawalFeeForm.feeValue) === preset;
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() =>
                              setWithdrawalFeeForm((prev) => ({ ...prev, feeValue: preset }))
                            }
                            className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-mono-num font-bold border cursor-pointer transition-colors ${
                              active
                                ? 'bg-[#E2136E] border-[#E2136E] text-white'
                                : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text)] hover:border-[#E2136E]/50'
                            }`}
                          >
                            {preset === 0
                              ? 'ফ্রি (০)'
                              : withdrawalFeeForm.feeType === 'percent'
                                ? `${toBn(preset)}%`
                                : `৳${toBn(preset)}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] space-y-3">
                  <div>
                    <label htmlFor="cfg-wd-fee" className="block text-xs text-[var(--muted)] mb-1">
                      কাস্টম ফি পরিমাণ ({withdrawalFeeForm.feeType === 'percent' ? '%' : '৳'})
                    </label>
                    <input
                      id="cfg-wd-fee"
                      type="number"
                      min="0"
                      max={withdrawalFeeForm.feeType === 'percent' ? 50 : 1000}
                      step="0.01"
                      value={withdrawalFeeForm.feeValue}
                      onChange={(e) =>
                        setWithdrawalFeeForm((prev) => ({
                          ...prev,
                          feeValue: Number(e.target.value),
                        }))
                      }
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm font-mono-num"
                    />
                  </div>

                  {(() => {
                    const sample = calculateWithdrawalTotal(100, withdrawalFeeForm);
                    return (
                      <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs space-y-1">
                        <p className="font-semibold text-[var(--muted)]">উদাহরণ: ইউজার ৳১০০ উত্তোলন করলে</p>
                        <p className="font-mono-num text-[var(--text)]">
                          বিকাশে পাবেন <strong>৳{fmtAmount(sample.payoutAmount)}</strong> + ফি{' '}
                          <strong className="text-[var(--gold)]">৳{fmtAmount(sample.fee)}</strong> = মোট ওয়ালেট থেকে কাটবে{' '}
                          <strong className="text-[var(--emerald)]">৳{fmtAmount(sample.totalDeducted)}</strong>
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </form>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] overflow-x-auto">
              {(
                [
                  ['all', `সব (${toBn(withdrawals.length)})`],
                  ['প্রসেসিং', `প্রসেসিং (${toBn(pendingWithdrawals.length)})`],
                  ['সম্পন্ন', `সম্পন্ন (${toBn(withdrawals.filter((w) => w.status === 'সম্পন্ন').length)})`],
                  ['বাতিল', `বাতিল (${toBn(withdrawals.filter((w) => w.status === 'বাতিল').length)})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setWdFilter(id)}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer ${
                    wdFilter === id
                      ? 'bg-[var(--primary)] text-white'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
              {filteredWithdrawals.length === 0 ? (
                <div className="p-8 text-center text-sm text-[var(--muted)]">কোনো উত্তোলনের অনুরোধ নেই</div>
              ) : (
                filteredWithdrawals.map((w) => {
                  const decrypted = decryptedNumbers[w.id];
                  const wdFee = Number(w.fee || 0);
                  const wdTotal = Number(w.totalAmount ?? w.amount + wdFee);
                  return (
                    <div key={w.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {w.method === 'bKash' && <BkashLogo className="w-8 h-8 shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-bold">
                            {w.userName} · {w.method} ·{' '}
                            <span className="font-mono-num text-[var(--primary)]">
                              {decrypted || w.maskedNumber}
                            </span>
                          </p>
                          <p className="text-xs text-[var(--muted)]">
                            {w.dateLabel} · স্ট্যাটাস:{' '}
                            <strong
                              className={
                                w.status === 'সম্পন্ন'
                                  ? 'text-[var(--emerald)]'
                                  : w.status === 'বাতিল'
                                    ? 'text-[var(--danger)]'
                                    : 'text-[var(--gold)]'
                              }
                            >
                              {w.status}
                            </strong>{' '}
                            · পাঠাতে হবে: <span className="font-mono-num font-bold">৳{fmtAmount(w.amount)}</span>
                            {wdFee > 0 && (
                              <span className="font-mono-num">
                                {' '}· ফি: ৳{fmtAmount(wdFee)} · মোট কর্তন: ৳{fmtAmount(wdTotal)}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {!decrypted && (
                          <button
                            type="button"
                            onClick={() => handleDecryptNumber(w.id, w.encryptedAccount, w.userId)}
                            className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            <span>নম্বর ডিক্রিপ্ট</span>
                          </button>
                        )}
                        {w.status === 'প্রসেসিং' && (
                          <>
                            <button
                              type="button"
                              disabled={busyAction}
                              onClick={() => handleWithdrawalAction(w, 'সম্পন্ন')}
                              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-emerald-500/15 text-[var(--emerald)] text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>সম্পন্ন</span>
                            </button>
                            <button
                              type="button"
                              disabled={busyAction}
                              onClick={() => handleWithdrawalAction(w, 'বাতিল')}
                              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-rose-500/15 text-[var(--danger)] text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>বাতিল (রিফান্ড)</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      <Modal
        open={selectedUser !== null}
        onClose={() => setSelectedUserUid(null)}
        title={selectedUser?.name || 'ব্যবহারকারী'}
      >
        {selectedUser && (() => {
          const userEmail = selectedUser.email || selectedUser.emailMasked || '';
          const userPendingWds = withdrawals.filter(
            (w) => w.userId === selectedUser.uid && w.status === 'প্রসেসিং'
          );
          const userPendingSubs = submissions.filter(
            (s) => s.userId === selectedUser.uid && s.status === 'পেন্ডিং'
          );
          return (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[var(--muted)] flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-[var(--primary)]" />
                    <span>অ্যাকাউন্টের ইমেইল</span>
                  </span>
                  {userEmail && (
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(userEmail);
                        onToast('ইমেইল কপি করা হয়েছে', 'ok');
                      }}
                      className="text-[11px] font-semibold text-[var(--primary)] flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>কপি</span>
                    </button>
                  )}
                </div>
                <p className="text-sm font-bold font-mono-num break-all text-[var(--text)]">
                  {userEmail || 'ইমেইল পাওয়া যায়নি'}
                </p>
                {selectedUser.email && selectedUser.emailMasked && (
                  <p className="text-[11px] text-[var(--muted)] font-mono-num">
                    মাস্কড: {selectedUser.emailMasked}
                  </p>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <p className="flex justify-between items-center gap-2">
                  <span className="text-[var(--muted)]">অবস্থা</span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                      selectedUser.suspended
                        ? 'bg-rose-500/15 text-[var(--danger)]'
                        : 'bg-emerald-500/15 text-[var(--emerald)]'
                    }`}
                  >
                    {selectedUser.suspended ? 'সাসপেন্ডেড' : 'সচল অ্যাকাউন্ট'}
                  </span>
                </p>
                {selectedUser.suspended && selectedUser.suspensionReason && (
                  <p className="text-xs text-[var(--danger)] bg-rose-500/10 px-3 py-2 rounded-xl">
                    সাসপেন্ডের কারণ: {selectedUser.suspensionReason}
                  </p>
                )}
                <div className="flex justify-between items-center gap-2">
                  <span className="text-[var(--muted)] shrink-0">UID</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono-num text-xs break-all text-right">{selectedUser.uid}</span>
                    <button
                      type="button"
                      aria-label="UID কপি করুন"
                      onClick={() => {
                        void navigator.clipboard.writeText(selectedUser.uid);
                        onToast('UID কপি হয়েছে', 'ok');
                      }}
                      className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--muted)] cursor-pointer shrink-0"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <p className="flex justify-between">
                  <span className="text-[var(--muted)]">ভূমিকা</span>
                  <span className="font-semibold">
                    {selectedUser.role === 'admin' ? 'অ্যাডমিন' : 'সাধারণ ব্যবহারকারী'}
                  </span>
                </p>
                <p className="flex justify-between">
                  <span className="text-[var(--muted)]">রেফারেল কোড</span>
                  <span className="font-mono-num font-bold">{selectedUser.refCode}</span>
                </p>
                {selectedUser.referredBy && (
                  <p className="flex justify-between">
                    <span className="text-[var(--muted)]">রেফারড বাই</span>
                    <span className="font-mono-num text-xs">{selectedUser.referredBy}</span>
                  </p>
                )}
                <p className="flex justify-between">
                  <span className="text-[var(--muted)]">বর্তমান ব্যালেন্স</span>
                  <span className="font-mono-num font-bold text-[var(--emerald)]">
                    ৳{fmtAmount(selectedUser.balance)}
                  </span>
                </p>
                <p className="flex justify-between">
                  <span className="text-[var(--muted)]">মোট আয়</span>
                  <span className="font-mono-num">৳{fmtAmount(selectedUser.totalEarned)}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-[var(--muted)]">আজকের আয়</span>
                  <span className="font-mono-num text-xs">
                    ৳{fmtAmount(selectedUser.dailyTodayEarn || 0)}
                  </span>
                </p>
                <p className="flex justify-between">
                  <span className="text-[var(--muted)]">রেফারেল ও স্ট্রিক</span>
                  <span className="font-mono-num text-xs">
                    {toBn(selectedUser.referrals)} জন · {toBn(selectedUser.streakCount)} দিন
                  </span>
                </p>
              </div>

              {(userPendingWds.length > 0 || userPendingSubs.length > 0) && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs space-y-2">
                  <p className="font-bold text-[var(--gold)]">অপেক্ষমাণ অনুরোধ</p>
                  <div className="flex flex-wrap gap-2">
                    {userPendingWds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUserUid(null);
                          setWdFilter('প্রসেসিং');
                          setTab('withdraw');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] font-semibold cursor-pointer"
                      >
                        উত্তোলন ({toBn(userPendingWds.length)}) দেখুন ›
                      </button>
                    )}
                    {userPendingSubs.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUserUid(null);
                          setSubFilter('পেন্ডিং');
                          setTab('submissions');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] font-semibold cursor-pointer"
                      >
                        অ্যাকাউন্ট সেল ({toBn(userPendingSubs.length)}) দেখুন ›
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-[var(--border)] space-y-2">
                <p className="text-xs font-bold text-[var(--muted)]">এই ইউজারের সাম্প্রতিক লেনদেন</p>
                {selectedUserTxsLoading ? (
                  <p className="text-xs text-[var(--muted)] py-2">লেনদেন লোড হচ্ছে...</p>
                ) : selectedUserTxs.length === 0 ? (
                  <p className="text-xs text-[var(--muted)] py-2">কোনো লেনদেন পাওয়া যায়নি</p>
                ) : (
                  <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] divide-y divide-[var(--border)]">
                    {selectedUserTxs.slice(0, 5).map((t) => (
                      <div key={t.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{t.title}</p>
                          <p className="text-[11px] text-[var(--muted)] font-mono-num truncate">
                            {t.dateLabel} · {t.receiptId}
                          </p>
                        </div>
                        <span
                          className={`font-mono-num font-bold shrink-0 ${
                            t.type === 'in' ? 'text-[var(--emerald)]' : 'text-[var(--danger)]'
                          }`}
                        >
                          {t.type === 'in' ? '+' : '-'}৳{fmtAmount(t.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-[var(--border)] space-y-2.5">
                <p className="text-xs font-bold text-[var(--muted)]">সমস্যা সমাধান ও দ্রুত অ্যাকশন</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustUser(selectedUser);
                      setAdjustType('credit');
                      setAdjustAmount('100');
                      setAdjustNote('');
                    }}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>ব্যালেন্স সমন্বয়</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdHocSupportUser(selectedUser);
                      setActiveSupportThreadUid(selectedUser.uid);
                      setSelectedUserUid(null);
                      setTab('support');
                    }}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-[var(--primary)]" />
                    <span>লাইভ মেসেজ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTxSearch(selectedUser.name);
                      setTxFilter('all');
                      setSelectedUserUid(null);
                      setTab('tx');
                    }}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>লেনদেন দেখুন ›</span>
                  </button>
                  {selectedUser.role !== 'admin' && selectedUser.uid !== adminUid ? (
                    selectedUser.suspended ? (
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => void handleUnsuspend(selectedUser)}
                        className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-500/15 text-[var(--emerald)] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>সচল করুন</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => {
                          setSuspendTarget(selectedUser);
                          setSuspendReason('');
                        }}
                        className="min-h-[40px] px-3 py-2 rounded-xl bg-rose-500/15 text-[var(--danger)] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>সাসপেন্ড</span>
                      </button>
                    )
                  ) : (
                    <div className="min-h-[40px] px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--muted)] flex items-center justify-center">
                      অ্যাডমিন অ্যাকাউন্ট
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal
        open={adjustUser !== null}
        onClose={() => setAdjustUser(null)}
        title={`ব্যালেন্স সমন্বয় · ${adjustUser?.name || ''}`}
      >
        {adjustUser && (
          <form onSubmit={handleCustomAdjustSubmit} className="space-y-4">
            <p className="text-xs text-[var(--muted)] font-mono-num">
              বর্তমান ব্যালেন্স: ৳{fmtAmount(adjustUser.balance)}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAdjustType('credit')}
                className={`min-h-[42px] rounded-xl text-xs font-bold border cursor-pointer ${
                  adjustType === 'credit'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-[var(--emerald)]'
                    : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--muted)]'
                }`}
              >
                + যোগ করুন (ক্রেডিট)
              </button>
              <button
                type="button"
                onClick={() => setAdjustType('debit')}
                className={`min-h-[42px] rounded-xl text-xs font-bold border cursor-pointer ${
                  adjustType === 'debit'
                    ? 'bg-rose-500/15 border-rose-500/40 text-[var(--danger)]'
                    : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--muted)]'
                }`}
              >
                - বাদ দিন (ডেবিট)
              </button>
            </div>

            <div>
              <label htmlFor="admin-adjust-amount" className="block text-xs text-[var(--muted)] mb-1">
                টাকার পরিমাণ (৳)
              </label>
              <input
                id="admin-adjust-amount"
                type="number"
                min="1"
                max="100000"
                step="1"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono-num focus:outline-none focus:border-[var(--primary)]"
              />
            </div>

            <div>
              <label htmlFor="admin-adjust-note" className="block text-xs text-[var(--muted)] mb-1">
                নোট (ঐচ্ছিক)
              </label>
              <input
                id="admin-adjust-note"
                type="text"
                maxLength={120}
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="যেমন: বিশেষ বোনাস বা সমন্বয়"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
              />
            </div>

            <button
              type="submit"
              disabled={busyAction}
              className="w-full min-h-[44px] rounded-xl bg-[var(--primary)] text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
            >
              {busyAction ? 'আপডেট হচ্ছে...' : 'ব্যালেন্স আপডেট নিশ্চিত করুন'}
            </button>
          </form>
        )}
      </Modal>
      <Modal
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        title="সাবমিশন রিজেক্ট করুন"
      >
        {rejectTarget && (
          <form onSubmit={handleRejectSubmission} className="space-y-4">
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              রিজেক্ট করলে ব্যবহারকারী ({rejectTarget.userName}) কোনো টাকা পাবেন না।
            </p>
            <div>
              <label htmlFor="reject-reason" className="block text-xs text-[var(--muted)] mb-1">
                রিজেক্টের কারণ (ঐচ্ছিক)
              </label>
              <input
                id="reject-reason"
                type="text"
                maxLength={200}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="যেমন: পাসওয়ার্ড ভুল বা অ্যাকাউন্ট ভেরিফায়েড নয়"
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
              />
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="flex-1 min-h-[42px] rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-semibold cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="submit"
                disabled={busyAction}
                className="flex-1 min-h-[42px] rounded-xl bg-[var(--danger)] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {busyAction ? 'প্রসেসিং...' : 'রিজেক্ট নিশ্চিত করুন'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={suspendTarget !== null}
        onClose={() => setSuspendTarget(null)}
        title="অ্যাকাউন্ট সাসপেন্ড করুন"
      >
        {suspendTarget && (
          <form onSubmit={handleConfirmSuspend} className="space-y-4">
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              <strong className="text-[var(--text)]">{suspendTarget.name}</strong>-এর অ্যাকাউন্ট সাসপেন্ড করলে তিনি লগইন করে ড্যাশবোর্ডে প্রবেশ করতে পারবেন না এবং সাসপেনশন পপআপ পাবেন। তবে তিনি লাইভ সাপোর্টে আপনার সাথে যোগাযোগ করতে পারবেন।
            </p>
            <div>
              <label htmlFor="suspend-reason" className="block text-xs text-[var(--muted)] mb-1">
                সাসপেন্ডের কারণ (ঐচ্ছিক)
              </label>
              <input
                id="suspend-reason"
                type="text"
                maxLength={240}
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="যেমন: নিয়ম ভঙ্গ বা ভুয়া তথ্য প্রদান"
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
              />
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setSuspendTarget(null)}
                className="flex-1 min-h-[42px] rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-semibold cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="submit"
                disabled={busyAction}
                className="flex-1 min-h-[42px] rounded-xl bg-[var(--danger)] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {busyAction ? 'প্রসেসিং...' : 'সাসপেন্ড নিশ্চিত করুন'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

