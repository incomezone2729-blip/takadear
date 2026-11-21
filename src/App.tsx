import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  ArrowLeft,
  Ban,
  CheckSquare,
  CreditCard,
  Home,
  LogOut,
  MessageCircle,
  Shield,
  User as UserIcon,
} from 'lucide-react';
import {
  auth,
  testConnection,
} from './firebase';
import {
  fetchApiHealth,
  verifyServerSession,
} from './services/secureApi';
import {
  claimPendingReferrals,
  ensureUserAccount,
  evaluateAndClaimInviteeReferral,
  fetchAccountSellSettings,
  fetchReferralSettings,
  fetchUserAccountSnapshot,
  fetchUserAccountSubmissions,
  fetchUserActivity,
  fetchWithdrawalSettings,
  performDailyCheckin,
  submitAccountForSale,
  submitEncryptedWithdrawal,
  subscribeAccountSellSettings,
  subscribeReferralSettings,
  subscribeUserAccount,
  subscribeUserSupportThread,
  subscribeWithdrawalSettings,
  updateUserTheme,
  type AccountSubmissionRecord,
  type InviteeReferralStatus,
  type SupportThreadRecord,
  type TransactionRecord,
  type UserAccount,
  type UserPrivateVault,
  type WithdrawalRecord,
} from './services/firestoreService';
import {
  buildPasswordResetUrl,
  calculateUserLevel,
  DEFAULT_ACCOUNT_SELL_SETTINGS,
  DEFAULT_REFERRAL_SETTINGS,
  DEFAULT_WITHDRAWAL_SETTINGS,
  fmtAmount,
  fmtBnReward,
  formatAppErrorMessage,
  isAdminEmail,
  isPasswordResetReturnPath,
  parseAuthActionFromUrl,
  parseReferralEntryFromUrl,
  PUBLIC_APP_ORIGIN,
  toBn,
  type AccountPlatform,
  type AccountSellSettingsConfig,
  type PaymentMethod,
  type ReferralSettingsConfig,
  type ThemeMode,
  type WithdrawalSettingsConfig,
} from './utils/takadearLogic';
import { AuthScreen } from './components/AuthScreen';
import { EmailVerificationScreen } from './components/EmailVerificationScreen';
import { PasswordResetScreen } from './components/PasswordResetScreen';
import { HomeView, type NavPage } from './components/HomeView';
import { TasksView } from './components/TasksView';
import { WalletView } from './components/WalletView';
import { ProfileView } from './components/ProfileView';
import { AdminView } from './components/AdminView';
import { AccountSellPage } from './components/AccountSellPage';
import { LiveSupportChat } from './components/LiveSupportChat';
import { Modal } from './components/Modal';
import { Toast, type ToastVariant } from './components/Toast';

function mapAuthErrorToBn(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  if (code === 'auth/email-already-in-use') return 'এই ইমেইলটি ইতিমধ্যেই নিবন্ধিত আছে';
  if (code === 'auth/invalid-email') return 'ইমেইল ঠিকানা সঠিক নয়';
  if (code === 'auth/weak-password') return 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে';
  if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'ইমেইল অথবা পাসওয়ার্ড সঠিক নয়';
  }
  if (code === 'auth/too-many-requests') {
    return 'অতিরিক্ত চেষ্টার কারণে সাময়িকভাবে ব্লক করা হয়েছে, কিছুক্ষণ পর আবার চেষ্টা করুন';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Firebase Console থেকে Email/Password Sign-in চালু করুন';
  }
  return err instanceof Error ? err.message : 'অথেনটিকেশনে সমস্যা হয়েছে';
}

const NAV_ITEMS: Array<{ id: NavPage; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'home', label: 'হোম', Icon: Home },
  { id: 'tasks', label: 'কাজ', Icon: CheckSquare },
  { id: 'wallet', label: 'ওয়ালেট', Icon: CreditCard },
  { id: 'profile', label: 'প্রোফাইল', Icon: UserIcon },
];

export default function App() {
  const [booting, setBooting] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('autostart') !== '1';
  });

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);

  const [account, setAccount] = useState<UserAccount | null>(null);
  const [vault, setVault] = useState<UserPrivateVault | null>(null);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
  const [accountSellSettings, setAccountSellSettings] = useState<AccountSellSettingsConfig>({
    ...DEFAULT_ACCOUNT_SELL_SETTINGS,
  });
  const [referralSettings, setReferralSettings] = useState<ReferralSettingsConfig>({
    ...DEFAULT_REFERRAL_SETTINGS,
  });
  const [withdrawalSettings, setWithdrawalSettings] = useState<WithdrawalSettingsConfig>({
    ...DEFAULT_WITHDRAWAL_SETTINGS,
  });
  const [inviteeStatus, setInviteeStatus] = useState<InviteeReferralStatus | null>(null);
  const [accountSubmissions, setAccountSubmissions] = useState<AccountSubmissionRecord[]>([]);
  const [supportThread, setSupportThread] = useState<SupportThreadRecord | null>(null);
  const [suspendedChatOpen, setSuspendedChatOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [page, setPage] = useState<NavPage>('home');
  const [showAdmin, setShowAdmin] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [busy, setBusy] = useState(false);

  const [rewardModal, setRewardModal] = useState<{ title: string; body: string } | null>(null);
  const [toastState, setToastState] = useState<{ message: string | null; variant: ToastVariant }>({
    message: null,
    variant: 'default',
  });

  const pendingSignupMetaRef = useRef<{ name?: string; refCode?: string }>({});
  const autoOpenedAdminUidRef = useRef<string | null>(null);
  const wasSignedOutRef = useRef(true);
  const toastTimerRef = useRef<number | null>(null);
  const walletActionLockRef = useRef(false);
  const accountRef = useRef<UserAccount | null>(null);
  accountRef.current = account;

  const { initialRefCode, defaultToSignup } = parseReferralEntryFromUrl(
    window.location.pathname,
    window.location.search
  );
  const [resetOobCode, setResetOobCode] = useState<string>(
    () => parseAuthActionFromUrl(window.location.search).oobCode
  );
  const [resetReturnInfo] = useState<string | null>(() =>
    isPasswordResetReturnPath(window.location.pathname, window.location.search)
      ? 'পাসওয়ার্ড রিসেট সম্পন্ন হয়ে থাকলে আপনার নতুন পাসওয়ার্ড দিয়ে লগইন করুন।'
      : null
  );

  const showToast = useCallback((message: string, variant: ToastVariant = 'default') => {
    setToastState({ message, variant });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(
      () => {
        setToastState({ message: null, variant: 'default' });
      },
      variant === 'err' ? 4500 : 2800
    );
  }, []);

  // Sync theme on <html> element
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#0b0d17' : '#eef1fa');
    }
  }, [theme]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [page]);

  // Scrub sensitive reset query params (apiKey, oobCode) from browser URL bar immediately
  useEffect(() => {
    if (resetOobCode && window.location.search) {
      window.history.replaceState({}, '', '/reset-password');
    } else if (resetReturnInfo) {
      window.history.replaceState({}, '', '/');
    }
  }, [resetOobCode, resetReturnInfo]);

  // Connection & health probes on boot
  useEffect(() => {
    void testConnection();
    void fetchApiHealth().catch(() => {});

    if (booting) {
      const t = window.setTimeout(() => setBooting(false), 750);
      return () => {
        window.clearTimeout(t);
      };
    }
  }, [booting]);

  const hydrateUserSession = useCallback(
    async (user: User) => {
      setBusy(true);
      try {
        const tokenRes = await user.getIdTokenResult();
        if (user.emailVerified && !tokenRes.claims.email_verified) {
          await user.getIdToken(true);
        }

        const meta = pendingSignupMetaRef.current;
        pendingSignupMetaRef.current = {};

        const [sessionRes, ensured, sellCfg, refCfg, wdCfg, subs] = await Promise.all([
          verifyServerSession().catch(() => ({
            verified: false,
            isAdmin: user.emailVerified && isAdminEmail(user.email),
          })),
          ensureUserAccount(user, {
            displayName: meta.name,
            referredBy: meta.refCode || initialRefCode,
          }),
          fetchAccountSellSettings(),
          fetchReferralSettings(),
          fetchWithdrawalSettings(),
          fetchUserAccountSubmissions(user.uid).catch(() => []),
        ]);

        const [inviteeRes, claimed] = await Promise.all([
          evaluateAndClaimInviteeReferral(user.uid).catch(() => ({
            unlockedBonus: 0,
            status: null,
          })),
          claimPendingReferrals(user.uid, ensured.account).catch(() => 0),
        ]);
        const finalEnsure =
          claimed > 0 || inviteeRes.unlockedBonus > 0
            ? await ensureUserAccount(user)
            : ensured;

        const activity = await fetchUserActivity(user.uid);
        const resolvedAdmin = Boolean(
          user.emailVerified && isAdminEmail(user.email) && sessionRes.isAdmin
        );

        setAccount((prev) => {
          const next = finalEnsure.account;
          const prevMs = prev?.updatedAt?.toMillis?.() ?? 0;
          const nextMs = next?.updatedAt?.toMillis?.() ?? 0;
          return prev && prevMs > nextMs ? prev : next;
        });
        setVault(finalEnsure.vault);
        setTheme(finalEnsure.account.theme || 'dark');
        setTransactions(activity.transactions);
        setWithdrawals(activity.withdrawals);
        setAccountSellSettings(sellCfg);
        setReferralSettings(refCfg);
        setWithdrawalSettings(wdCfg);
        setInviteeStatus(inviteeRes.status);
        setAccountSubmissions(subs);
        setIsAdmin(resolvedAdmin);

        if (resolvedAdmin && autoOpenedAdminUidRef.current !== user.uid) {
          autoOpenedAdminUidRef.current = user.uid;
          setShowAdmin(true);
        }

        if (ensured.isNewUser) {
          setRewardModal({
            title: 'স্বাগতম টাকাডিয়ারে!',
            body:
              inviteeRes.unlockedBonus > 0
                ? `আপনার অ্যাকাউন্ট তৈরি হয়েছে এবং রেফারেল স্বাগত বোনাস ৳${fmtAmount(inviteeRes.unlockedBonus)} যোগ হয়েছে।`
                : 'আপনার অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে। দৈনিক চেক-ইন, অ্যাকাউন্ট সেল ও রেফার করে আয় শুরু করুন।',
          });
        } else {
          if (claimed > 0) {
            showToast(`নতুন ${toBn(claimed)}টি রেফারেল বোনাস যোগ হয়েছে!`, 'ok');
          }
          if (inviteeRes.unlockedBonus > 0) {
            showToast(
              `রেফারেল শর্ত পূরণ হওয়ায় +৳${fmtBnReward(inviteeRes.unlockedBonus)} স্বাগত বোনাস যোগ হয়েছে!`,
              'ok'
            );
          }
        }
      } catch (err) {
        showToast(formatAppErrorMessage(err, 'ডাটা লোড ব্যর্থ হয়েছে'), 'err');
      } finally {
        setBusy(false);
      }
    },
    [initialRefCode, showToast]
  );

  // Firebase Auth state listener (regular users do not require email verification; admin email verification enforced below)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthResolved(true);
      if (user) {
        if (wasSignedOutRef.current) {
          wasSignedOutRef.current = false;
          setPage('home');
        }
        if (isAdminEmail(user.email) && !user.emailVerified) {
          setIsAdmin(false);
          setShowAdmin(false);
          return;
        }
        void hydrateUserSession(user);
      } else {
        wasSignedOutRef.current = true;
        autoOpenedAdminUidRef.current = null;
        setPage('home');
        setAccount(null);
        setVault(null);
        setTransactions([]);
        setWithdrawals([]);
        setAccountSubmissions([]);
        setInviteeStatus(null);
        setSupportThread(null);
        setSuspendedChatOpen(false);
        setIsAdmin(false);
        setShowAdmin(false);
      }
    });
    return () => unsub();
  }, [hydrateUserSession]);

  // Real-time account, support thread, and task/referral settings listeners
  useEffect(() => {
    if (!firebaseUser) return;
    if (isAdminEmail(firebaseUser.email) && !firebaseUser.emailVerified) return;

    const unsubAccount = subscribeUserAccount(
      firebaseUser.uid,
      (latest) => {
        setAccount(latest);
        if (!latest.suspended) {
          setSuspendedChatOpen(false);
        }
      },
      () => {
        showToast('ওয়ালেট সিঙ্ক করতে সমস্যা হয়েছে, অনুগ্রহ করে ইন্টারনেট সংযোগ পরীক্ষা করুন', 'err');
      }
    );
    const unsubSupport = subscribeUserSupportThread(firebaseUser.uid, (thread) => {
      setSupportThread(thread);
    });
    const unsubAccountSell = subscribeAccountSellSettings((settings) => {
      setAccountSellSettings(settings);
    });
    const unsubReferralSettings = subscribeReferralSettings((settings) => {
      setReferralSettings(settings);
    });
    const unsubWithdrawalSettings = subscribeWithdrawalSettings((settings) => {
      setWithdrawalSettings(settings);
    });

    return () => {
      unsubAccount();
      unsubSupport();
      unsubAccountSell();
      unsubReferralSettings();
      unsubWithdrawalSettings();
    };
  }, [firebaseUser, showToast]);

  const refreshAccountAndActivity = useCallback(
    async (opts?: { checkInviteeReferral?: boolean }) => {
      if (!firebaseUser) return;
      const inviteePromise = opts?.checkInviteeReferral
        ? evaluateAndClaimInviteeReferral(firebaseUser.uid).catch(() => ({
            unlockedBonus: 0,
            status: null,
          }))
        : Promise.resolve(null);

      const [freshAccount, inviteeRes, activity, sellCfg, refCfg, wdCfg, subs] =
        await Promise.all([
          fetchUserAccountSnapshot(firebaseUser.uid),
          inviteePromise,
          fetchUserActivity(firebaseUser.uid),
          fetchAccountSellSettings(),
          fetchReferralSettings(),
          fetchWithdrawalSettings(),
          fetchUserAccountSubmissions(firebaseUser.uid).catch(() => []),
        ]);
      if (freshAccount) {
        setAccount(freshAccount);
      }
      setTransactions(activity.transactions);
      setWithdrawals(activity.withdrawals);
      setAccountSellSettings(sellCfg);
      setReferralSettings(refCfg);
      setWithdrawalSettings(wdCfg);
      if (inviteeRes) {
        setInviteeStatus(inviteeRes.status);
        if (inviteeRes.unlockedBonus > 0) {
          showToast(
            `রেফারেল শর্ত পূরণ হওয়ায় +৳${fmtBnReward(inviteeRes.unlockedBonus)} স্বাগত বোনাস যোগ হয়েছে!`,
            'ok'
          );
        }
      }
      setAccountSubmissions(subs);
    },
    [firebaseUser, showToast]
  );

  const handleEmailAuth = async (params: {
    mode: 'signup' | 'login';
    name: string;
    email: string;
    password: string;
    refCode: string;
  }) => {
    try {
      if (params.mode === 'signup') {
        pendingSignupMetaRef.current = {
          name: params.name,
          refCode: params.refCode,
        };
        const cred = await createUserWithEmailAndPassword(auth, params.email, params.password);
        await updateProfile(cred.user, { displayName: params.name }).catch(() => {});
        setPage('home');
        showToast('অ্যাকাউন্ট তৈরি হয়েছে! স্বাগতম টাকাডিয়ারে।', 'ok');
      } else {
        await signInWithEmailAndPassword(auth, params.email, params.password);
        setPage('home');
        showToast('লগইন সফল হয়েছে', 'ok');
      }
    } catch (err) {
      throw new Error(mapAuthErrorToBn(err));
    }
  };

  const handlePasswordReset = async (email: string) => {
    const targetResetUrl = buildPasswordResetUrl(
      referralSettings.referralDomain,
      PUBLIC_APP_ORIGIN
    );
    try {
      await sendPasswordResetEmail(auth, email, {
        url: targetResetUrl,
        handleCodeInApp: true,
      });
      showToast('পাসওয়ার্ড রিসেট ইমেইল পাঠানো হয়েছে', 'ok');
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (
        code === 'auth/unauthorized-continue-uri' ||
        code === 'auth/invalid-continue-uri'
      ) {
        const originResetUrl = buildPasswordResetUrl(null, window.location.origin);
        try {
          if (originResetUrl !== targetResetUrl) {
            await sendPasswordResetEmail(auth, email, {
              url: originResetUrl,
              handleCodeInApp: true,
            });
          } else {
            await sendPasswordResetEmail(auth, email);
          }
          showToast('পাসওয়ার্ড রিসেট ইমেইল পাঠানো হয়েছে', 'ok');
          return;
        } catch (fallbackErr) {
          const fallbackCode = (fallbackErr as { code?: string })?.code || '';
          if (
            fallbackCode === 'auth/unauthorized-continue-uri' ||
            fallbackCode === 'auth/invalid-continue-uri'
          ) {
            try {
              await sendPasswordResetEmail(auth, email);
              showToast('পাসওয়ার্ড রিসেট ইমেইল পাঠানো হয়েছে', 'ok');
              return;
            } catch (plainErr) {
              throw new Error(mapAuthErrorToBn(plainErr));
            }
          }
          throw new Error(mapAuthErrorToBn(fallbackErr));
        }
      }
      throw new Error(mapAuthErrorToBn(err));
    }
  };

  const handleCheckin = useCallback(async () => {
    const currentAccount = accountRef.current;
    if (!firebaseUser || !currentAccount || walletActionLockRef.current) return;
    walletActionLockRef.current = true;
    setBusy(true);
    try {
      const reward = await performDailyCheckin(firebaseUser.uid, currentAccount);
      await refreshAccountAndActivity({ checkInviteeReferral: true });
      setRewardModal({
        title: 'দৈনিক চেক-ইন সফল!',
        body: `আপনি পেয়েছেন ৳${fmtAmount(reward)} বোনাস।`,
      });
    } catch (err) {
      showToast(formatAppErrorMessage(err, 'চেক-ইন ব্যর্থ হয়েছে'), 'err');
    } finally {
      walletActionLockRef.current = false;
      setBusy(false);
    }
  }, [firebaseUser, refreshAccountAndActivity, showToast]);

  const handleSubmitWithdrawal = useCallback(
    async (method: PaymentMethod, accountNumber: string, amount: number) => {
      const currentAccount = accountRef.current;
      if (!firebaseUser || !currentAccount || walletActionLockRef.current) return;
      walletActionLockRef.current = true;
      try {
        await submitEncryptedWithdrawal(firebaseUser.uid, currentAccount, method, accountNumber, amount);
        await refreshAccountAndActivity();
        showToast('এনক্রিপ্টেড উত্তোলনের অনুরোধ পাঠানো হয়েছে', 'ok');
      } finally {
        walletActionLockRef.current = false;
      }
    },
    [firebaseUser, refreshAccountAndActivity, showToast]
  );

  const handleToggleTheme = async () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (firebaseUser) {
      await updateUserTheme(firebaseUser.uid, next).catch(() => {});
    }
    showToast(next === 'dark' ? 'ডার্ক মোড চালু' : 'লাইট মোড চালু');
  };

  const handleLogout = async () => {
    setShowAdmin(false);
    setPage('home');
    await signOut(auth);
    showToast('সফলভাবে লগআউট সম্পন্ন হয়েছে');
  };

  const handleSubmitAccountSale = async (params: {
    platform: AccountPlatform;
    identifier: string;
    password: string;
    note?: string;
  }) => {
    if (!firebaseUser || !account) return;
    await submitAccountForSale({
      uid: firebaseUser.uid,
      account,
      ...params,
    });
    await refreshAccountAndActivity();
    showToast('অ্যাকাউন্ট পেন্ডিং হিসেবে সাবমিট হয়েছে। অ্যাডমিন এপ্রুভ করলে টাকা যোগ হবে।', 'gold');
  };

  if (booting || !authResolved) {
    return (
      <div className="min-h-screen w-full bg-[var(--bg)] text-[var(--text)] flex flex-col items-center justify-center p-6">
        <img
          src="/logo.png"
          alt="টাকাডিয়ার লোগো"
          className="w-24 h-24 rounded-3xl object-cover shadow-xl border border-white/15 mb-5 select-none"
        />
        <h1 className="text-2xl font-bold">টাকাডিয়ার (TakaDear)</h1>
        <p className="text-xs text-[var(--muted)] mt-1">
          অ্যাপ লোড হচ্ছে...
        </p>
      </div>
    );
  }

  if (resetOobCode) {
    return (
      <>
        <PasswordResetScreen
          oobCode={resetOobCode}
          onDone={() => {
            setResetOobCode('');
            if (window.location.pathname !== '/' || window.location.search) {
              window.history.replaceState({}, '', '/');
            }
          }}
          onToast={showToast}
        />
        <Toast message={toastState.message} variant={toastState.variant} />
      </>
    );
  }

  if (!firebaseUser) {
    return (
      <>
        <AuthScreen
          initialRefCode={initialRefCode}
          defaultToSignup={defaultToSignup}
          initialInfoMsg={resetReturnInfo}
          referralSettings={referralSettings}
          onEmailAuth={handleEmailAuth}
          onPasswordReset={handlePasswordReset}
        />
        <Toast message={toastState.message} variant={toastState.variant} />
      </>
    );
  }

  if (isAdminEmail(firebaseUser.email) && !firebaseUser.emailVerified) {
    return (
      <>
        <EmailVerificationScreen
          email={firebaseUser.email || ''}
          onResend={async () => {
            try {
              await sendEmailVerification(firebaseUser);
              showToast('অ্যাডমিন ভেরিফিকেশন ইমেইল পাঠানো হয়েছে! ইনবক্স চেক করুন।', 'ok');
            } catch (err) {
              showToast(formatAppErrorMessage(err, 'ভেরিফিকেশন ইমেইল পাঠানো যায়নি'), 'err');
            }
          }}
          onRefresh={async () => {
            try {
              await reload(firebaseUser);
              if (auth.currentUser?.emailVerified) {
                await auth.currentUser.getIdToken(true);
                setFirebaseUser(auth.currentUser);
                await hydrateUserSession(auth.currentUser);
                showToast('অ্যাডমিন ইমেইল ভেরিফাই সম্পন্ন হয়েছে!', 'ok');
              } else {
                showToast('এখনো ইমেইল ভেরিফাই সম্পন্ন হয়নি', 'err');
              }
            } catch (err) {
              showToast(formatAppErrorMessage(err, 'ভেরিফিকেশন অবস্থা যাচাই করা যায়নি'), 'err');
            }
          }}
          onLogout={handleLogout}
        />
        <Toast message={toastState.message} variant={toastState.variant} />
      </>
    );
  }

  if (!account) {
    return (
      <div className="min-h-screen w-full bg-[var(--bg)] text-[var(--text)] flex flex-col items-center justify-center p-6">
        <p className="text-sm font-medium text-[var(--muted)]">আপনার অ্যাকাউন্ট লোড হচ্ছে...</p>
      </div>
    );
  }

  if (account.suspended && !isAdmin) {
    const unreadReplies = supportThread?.unreadByUser || 0;
    return (
      <div className="min-h-screen w-full bg-[var(--bg)] text-[var(--text)] flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="suspended-popup-title"
          className="w-full max-w-lg rounded-3xl bg-[var(--surface)] border border-rose-500/40 p-6 sm:p-7 shadow-2xl space-y-5"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 text-[var(--danger)] flex items-center justify-center shrink-0">
              <Ban className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 id="suspended-popup-title" className="text-lg font-bold text-[var(--danger)]">
                অ্যাকাউন্ট সাসপেন্ড করা হয়েছে
              </h1>
              <p className="text-xs sm:text-sm text-[var(--muted)] mt-1 leading-relaxed">
                অ্যাডমিন আপনার অ্যাকাউন্টটি সাময়িকভাবে সাসপেন্ড করেছেন। সাসপেন্ড অবস্থায় আপনি অ্যাপে লগইন বা লেনদেন করতে পারবেন না।
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] text-xs space-y-1">
            <p className="text-[var(--muted)]">
              অ্যাকাউন্ট: <strong className="text-[var(--text)]">{account.name}</strong> ({account.refCode})
            </p>
            {account.suspensionReason && (
              <p className="text-[var(--danger)] font-medium">
                কারণ: {account.suspensionReason}
              </p>
            )}
          </div>

          {suspendedChatOpen && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-[var(--text)]">
                  অ্যাডমিনের সাথে লাইভ সাপোর্ট চ্যাট
                </p>
                <button
                  type="button"
                  onClick={() => setSuspendedChatOpen(false)}
                  className="text-xs text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
                >
                  লুকান
                </button>
              </div>
              <LiveSupportChat
                threadUid={firebaseUser.uid}
                userName={account.name}
                userRefCode={account.refCode}
                userSuspended={true}
                viewerUid={firebaseUser.uid}
                viewerName={account.name}
                viewerRole="user"
                onToast={showToast}
                compact
              />
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5">
            {!suspendedChatOpen && (
              <button
                type="button"
                onClick={() => setSuspendedChatOpen(true)}
                className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--primary)] text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span>
                  লাইভ সাপোর্ট (অ্যাডমিনকে মেসেজ করুন)
                  {unreadReplies > 0 ? ` (${toBn(unreadReplies)})` : ''}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>লগআউট করুন</span>
            </button>
          </div>
        </div>
        <Toast message={toastState.message} variant={toastState.variant} />
      </div>
    );
  }

  if (showAdmin && isAdmin) {
    return (
      <>
        <AdminView
          adminUid={firebaseUser.uid}
          adminName={account.name}
          onBack={() => {
            setShowAdmin(false);
            void refreshAccountAndActivity();
          }}
          onLogout={handleLogout}
          onToast={showToast}
        />
        <Toast message={toastState.message} variant={toastState.variant} />
      </>
    );
  }

  const level = calculateUserLevel(account.totalEarned);
  const unreadSupport = supportThread?.unreadByUser || 0;

  return (
    <div className="min-h-screen w-full bg-[var(--bg)] text-[var(--text)] flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:shrink-0 bg-[var(--surface)] border-r border-[var(--border)] p-5 justify-between">
        <div>
          <div className="flex items-center gap-3 mb-8 px-2">
            <img
              src="/logo.png"
              alt="টাকাডিয়ার লোগো"
              className="w-10 h-10 rounded-xl object-cover border border-[var(--border)] shrink-0 select-none"
            />
            <div>
              <p className="text-base font-bold leading-tight">টাকাডিয়ার</p>
              <p className="text-[11px] text-[var(--muted)]">TakaDear Secure</p>
            </div>
          </div>

          <nav aria-label="প্রধান নেভিগেশন" className="space-y-1.5">
            {NAV_ITEMS.map(({ id, label, Icon }) => {
              const active =
                page === id ||
                (id === 'tasks' && (page === 'gmail-task' || page === 'facebook-task'));
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPage(id)}
                  className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-[var(--primary)] text-white'
                      : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPage('support')}
              className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-2 text-sm font-semibold transition-colors cursor-pointer ${
                page === 'support'
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
              }`}
            >
              <span className="flex items-center gap-3">
                <MessageCircle className="w-4 h-4 shrink-0" />
                <span>লাইভ সাপোর্ট</span>
              </span>
              {unreadSupport > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-rose-500 text-white text-[10px] font-bold">
                  {toBn(unreadSupport)}
                </span>
              )}
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAdmin(true)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold text-[var(--gold)] hover:bg-amber-500/10 transition-colors cursor-pointer"
              >
                <Shield className="w-4 h-4 shrink-0" />
                <span>অ্যাডমিন প্যানেল</span>
              </button>
            )}
          </nav>
        </div>

        <div className="p-3.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] text-xs space-y-1">
          <p className="font-semibold text-[var(--text)] truncate">{account.name}</p>
          <p className="text-[var(--muted)] font-mono-num">
            লেভেল {toBn(level)} · AES-256-GCM
          </p>
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-8">
        <header className="sticky top-0 z-30 h-14 bg-[var(--surface)]/95 backdrop-blur-md border-b border-[var(--border)] px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--primary)] text-white flex items-center justify-center font-bold text-sm shrink-0 lg:hidden">
              {account.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{account.name}</p>
              <p className="text-[11px] text-[var(--muted)] truncate">
                লেভেল {toBn(level)} · {toBn(account.referrals)} রেফারেল
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setPage('support')}
              className={`min-h-[36px] px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                page === 'support'
                  ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                  : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text)] hover:border-[var(--primary)]'
              }`}
            >
              <MessageCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">লাইভ সাপোর্ট</span>
              {unreadSupport > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[10px] font-bold leading-none">
                  {toBn(unreadSupport)}
                </span>
              )}
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAdmin(true)}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-[var(--gold)] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>অ্যাডমিন</span>
              </button>
            )}
            <div className="text-right">
              <span className="block text-[10px] text-[var(--muted)] leading-none">ব্যালেন্স</span>
              <span className="text-sm font-bold font-mono-num text-[var(--emerald)]">
                ৳{fmtAmount(account.balance)}
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
          {page === 'home' && (
            <HomeView
              account={account}
              transactions={transactions}
              sellSettings={accountSellSettings}
              busy={busy}
              onNavigate={setPage}
              onCheckin={handleCheckin}
            />
          )}
          {page === 'gmail-task' && (
            <AccountSellPage
              key="gmail"
              platform="gmail"
              sellSettings={accountSellSettings}
              submissions={accountSubmissions}
              onSubmitAccountSale={handleSubmitAccountSale}
              onBackHome={() => setPage('home')}
              onGoTasks={() => setPage('tasks')}
              onToast={showToast}
            />
          )}
          {page === 'facebook-task' && (
            <AccountSellPage
              key="facebook"
              platform="facebook"
              sellSettings={accountSellSettings}
              submissions={accountSubmissions}
              onSubmitAccountSale={handleSubmitAccountSale}
              onBackHome={() => setPage('home')}
              onGoTasks={() => setPage('tasks')}
              onToast={showToast}
            />
          )}
          {page === 'tasks' && (
            <TasksView
              account={account}
              sellSettings={accountSellSettings}
              referralSettings={referralSettings}
              submissions={accountSubmissions}
              onSubmitAccountSale={handleSubmitAccountSale}
              onToast={showToast}
            />
          )}
          {page === 'wallet' && (
            <WalletView
              account={account}
              withdrawals={withdrawals}
              withdrawalSettings={withdrawalSettings}
              onSubmitWithdrawal={handleSubmitWithdrawal}
              onToast={showToast}
            />
          )}
          {page === 'support' && (
            <div className="space-y-4 max-w-3xl mx-auto">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setPage('home')}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] text-xs font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>হোমে ফিরে যান</span>
                </button>
                <span className="text-xs text-[var(--muted)]">অ্যাডমিন সরাসরি উত্তর দেবেন</span>
              </div>

              <section className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[var(--primary)]/15 text-[var(--primary)] flex items-center justify-center shrink-0">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h1 className="text-base sm:text-lg font-bold">লাইভ সাপোর্ট</h1>
                    <p className="text-xs text-[var(--muted)]">
                      যেকোনো সমস্যা, পেমেন্ট বা অ্যাকাউন্ট সংক্রান্ত সাহায্যের জন্য অ্যাডমিনের সাথে কথা বলুন
                    </p>
                  </div>
                </div>

                <LiveSupportChat
                  threadUid={firebaseUser.uid}
                  userName={account.name}
                  userRefCode={account.refCode}
                  userSuspended={Boolean(account.suspended)}
                  viewerUid={firebaseUser.uid}
                  viewerName={account.name}
                  viewerRole="user"
                  onToast={showToast}
                />
              </section>
            </div>
          )}
          {page === 'profile' && (
            <ProfileView
              account={account}
              vault={vault}
              userEmail={firebaseUser.email || ''}
              isAdmin={isAdmin}
              theme={theme}
              referralSettings={referralSettings}
              inviteeStatus={inviteeStatus}
              onToggleTheme={handleToggleTheme}
              onOpenAdmin={isAdmin ? () => setShowAdmin(true) : undefined}
              onLogout={handleLogout}
              onToast={showToast}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation (within 15% sticky height cap) */}
      <nav
        aria-label="মোবাইল নেভিগেশন"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-16 bg-[var(--surface)]/95 backdrop-blur-md border-t border-[var(--border)] grid grid-cols-4 items-center"
      >
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active =
            page === id ||
            (id === 'tasks' && (page === 'gmail-task' || page === 'facebook-task'));
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPage(id)}
              className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer transition-colors ${
                active ? 'text-[var(--primary)] font-bold' : 'text-[var(--muted)]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="whitespace-nowrap">{label}</span>
            </button>
          );
        })}
      </nav>

      <Modal
        open={rewardModal !== null}
        onClose={() => setRewardModal(null)}
        title={rewardModal?.title || ''}
      >
        <p className="text-sm text-[var(--muted)] mb-5 leading-relaxed">{rewardModal?.body}</p>
        <button
          type="button"
          onClick={() => setRewardModal(null)}
          className="w-full min-h-[44px] rounded-xl bg-[var(--primary)] text-white text-sm font-semibold cursor-pointer"
        >
          ঠিক আছে
        </button>
      </Modal>

      <Toast message={toastState.message} variant={toastState.variant} />
    </div>
  );
}
