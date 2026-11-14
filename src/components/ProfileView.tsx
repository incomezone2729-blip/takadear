import React, { useState } from 'react';
import { Copy, Moon, Sun, Shield, LogOut, Lock } from 'lucide-react';
import type {
  InviteeReferralStatus,
  UserAccount,
  UserPrivateVault,
} from '../services/firestoreService';
import type { ReferralSettingsConfig, ThemeMode } from '../utils/takadearLogic';
import {
  DEFAULT_REFERRAL_SETTINGS,
  fmtAmount,
  fmtBnReward,
  toBn,
} from '../utils/takadearLogic';
import { Modal } from './Modal';

interface ProfileViewProps {
  account: UserAccount;
  vault: UserPrivateVault | null;
  userEmail: string;
  isAdmin: boolean;
  theme: ThemeMode;
  referralSettings?: ReferralSettingsConfig;
  inviteeStatus?: InviteeReferralStatus | null;
  onToggleTheme: () => Promise<void>;
  onOpenAdmin?: () => void;
  onLogout: () => Promise<void>;
  onToast: (msg: string, variant?: 'default' | 'ok' | 'err' | 'gold') => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  account,
  vault,
  userEmail,
  isAdmin,
  theme,
  referralSettings = DEFAULT_REFERRAL_SETTINGS,
  inviteeStatus = null,
  onToggleTheme,
  onOpenAdmin,
  onLogout,
  onToast,
}) => {
  const [logoutModal, setLogoutModal] = useState(false);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(account.refCode);
      onToast('রেফারেল কোড কপি হয়েছে', 'ok');
    } catch {
      onToast('কপি করা যায়নি', 'err');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <section className="lg:col-span-5 rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-[var(--primary)] text-white text-3xl font-bold flex items-center justify-center mx-auto mb-4 shadow-md">
          {account.name.charAt(0)}
        </div>
        <h2 className="text-xl font-bold">{account.name}</h2>
        <p className="text-xs text-[var(--muted)] mt-1">{userEmail}</p>

        <div className="mt-6 p-4 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] text-left space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--muted)] flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[var(--emerald)]" />
              <span>প্রাইভেট ভল্ট</span>
            </span>
            <span className="font-mono-num font-semibold text-[var(--emerald)]">
              {vault?.encryptionAlgorithm || 'AES-256-GCM'}
            </span>
          </div>
          <p className="text-xs text-[var(--muted)] font-mono-num">
            মাস্কড ইমেইল: {vault?.emailMasked || userEmail}
          </p>
        </div>
      </section>

      <div className="lg:col-span-7 space-y-5">
        <section className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 space-y-4">
          <div>
            <h3 className="text-base font-bold">রেফারেল কোড ও বোনাস</h3>
            <p className="text-xs sm:text-sm text-[var(--text)] mt-1.5 leading-relaxed">
              বন্ধুকে আমন্ত্রণ জানালে আপনি{' '}
              <strong className="text-[var(--emerald)] font-mono-num">
                ৳{fmtBnReward(referralSettings.referrerBonus)}
              </strong>{' '}
              পাবেন এবং আপনার বন্ধু{' '}
              <strong className="text-[var(--primary)] font-mono-num">
                ৳{fmtBnReward(referralSettings.friendBonus)}
              </strong>{' '}
              বোনাস পাবে।
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-[var(--surface-2)] border border-dashed border-[var(--primary)]/50">
            <code className="text-lg font-bold font-mono-num tracking-widest text-[var(--primary)]">
              {account.refCode}
            </code>
            <button
              type="button"
              onClick={handleCopyCode}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>কোড কপি</span>
            </button>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] space-y-1.5">
            <p className="text-xs font-bold text-[var(--text)]">রেফারেলের শর্তাবলি:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs text-[var(--muted)] leading-relaxed">
              <li>
                বন্ধুকে রেজিস্ট্রেশনের সময় আপনার রেফার কোড (
                <strong className="font-mono-num text-[var(--text)]">{account.refCode}</strong>) ব্যবহার করতে হবে।
              </li>
              <li>
                {referralSettings.minTasks > 0
                  ? `বন্ধুকে কমপক্ষে ${toBn(referralSettings.minTasks)}টি টাস্ক বা স্পিন সম্পন্ন করতে হবে, তবেই উভয়ের বোনাস যোগ হবে।`
                  : 'অ্যাকাউন্ট খোলার পর প্রথম কার্যক্রমেই বোনাস আনলক হবে।'}
              </li>
              {referralSettings.conditionNote && <li>{referralSettings.conditionNote}</li>}
            </ol>
          </div>

          {inviteeStatus && inviteeStatus.friendAmount > 0 && (
            <div
              className={`p-3.5 rounded-2xl border text-xs leading-relaxed ${
                inviteeStatus.friendClaimed
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-[var(--emerald)]'
                  : 'bg-amber-500/10 border-amber-500/30 text-[var(--gold)]'
              }`}
            >
              {inviteeStatus.friendClaimed ? (
                <span>
                  আপনার রেফারেল স্বাগত বোনাস (+৳{fmtBnReward(inviteeStatus.friendAmount)}) ব্যালেন্সে যোগ হয়েছে।
                </span>
              ) : (
                <span>
                  আপনার স্বাগত রেফারেল বোনাস (+৳{fmtBnReward(inviteeStatus.friendAmount)}): শর্ত পূরণ (
                  {toBn(Math.min(inviteeStatus.completedCount, inviteeStatus.minTasks))}/
                  {toBn(inviteeStatus.minTasks)} টাস্ক বা স্পিন) সম্পন্ন হলেই ব্যালেন্সে যোগ হবে।
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[var(--surface-2)] p-3.5 text-center">
              <p className="text-lg font-bold font-mono-num text-[var(--primary)]">
                {toBn(account.referrals)}
              </p>
              <p className="text-xs text-[var(--muted)]">মোট রেফারেল</p>
            </div>
            <div className="rounded-2xl bg-[var(--surface-2)] p-3.5 text-center">
              <p className="text-lg font-bold font-mono-num text-[var(--emerald)]">
                ৳{fmtAmount(account.refEarned)}
              </p>
              <p className="text-xs text-[var(--muted)]">রেফারেল আয়</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
          <button
            type="button"
            onClick={onToggleTheme}
            className="w-full min-h-[56px] px-5 py-3.5 flex items-center justify-between text-sm font-medium hover:bg-[var(--surface-2)] transition-colors cursor-pointer rounded-t-3xl"
          >
            <span className="flex items-center gap-3">
              {theme === 'dark' ? <Moon className="w-4 h-4 text-[var(--primary)]" /> : <Sun className="w-4 h-4 text-[var(--gold)]" />}
              <span>থিম পরিবর্তন ({theme === 'dark' ? 'ডার্ক মোড' : 'লাইট মোড'})</span>
            </span>
            <span className="text-xs text-[var(--muted)]">পরিবর্তন করুন ›</span>
          </button>

          {isAdmin && onOpenAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="w-full min-h-[56px] px-5 py-3.5 flex items-center justify-between text-sm font-medium hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-3">
                <Shield className="w-4 h-4 text-[var(--gold)]" />
                <span>অ্যাডমিন কন্ট্রোল প্যানেল</span>
              </span>
              <span className="text-xs font-semibold text-[var(--gold)]">
                খুলুন ›
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setLogoutModal(true)}
            className="w-full min-h-[56px] px-5 py-3.5 flex items-center justify-between text-sm font-medium text-[var(--danger)] hover:bg-rose-500/10 transition-colors cursor-pointer rounded-b-3xl"
          >
            <span className="flex items-center gap-3">
              <LogOut className="w-4 h-4" />
              <span>লগআউট</span>
            </span>
            <span>›</span>
          </button>
        </section>
      </div>

      <Modal open={logoutModal} onClose={() => setLogoutModal(false)} title="লগআউট করবেন?">
        <p className="text-sm text-[var(--muted)] mb-5">
          আপনার সকল তথ্য নিরাপদে সংরক্ষিত আছে। আপনি পুনরায় লগইন করে ফিরে আসতে পারবেন।
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setLogoutModal(false)}
            className="flex-1 min-h-[44px] rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm font-semibold cursor-pointer"
          >
            না
          </button>
          <button
            type="button"
            onClick={async () => {
              setLogoutModal(false);
              await onLogout();
            }}
            className="flex-1 min-h-[44px] rounded-xl bg-[var(--danger)] text-white text-sm font-semibold cursor-pointer"
          >
            লগআউট
          </button>
        </div>
      </Modal>
    </div>
  );
};
