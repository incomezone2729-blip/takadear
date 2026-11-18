import React, { useEffect, useState } from 'react';
import { Copy, CheckCircle2, Clock, Mail, ShieldAlert, Users, XCircle } from 'lucide-react';
import type {
  AccountSubmissionRecord,
  UserAccount,
} from '../services/firestoreService';
import {
  DEFAULT_REFERRAL_SETTINGS,
  fmtAmount,
  fmtBnReward,
  toBn,
  validateAccountSubmissionInput,
  type AccountPlatform,
  type AccountSellSettingsConfig,
  type ReferralSettingsConfig,
} from '../utils/takadearLogic';
import { Modal } from './Modal';
import { FacebookLogo } from './FacebookLogo';

interface TasksViewProps {
  account: UserAccount;
  sellSettings: AccountSellSettingsConfig;
  referralSettings?: ReferralSettingsConfig;
  submissions: AccountSubmissionRecord[];
  onSubmitAccountSale: (params: {
    platform: AccountPlatform;
    identifier: string;
    password: string;
    price: number;
    note?: string;
  }) => Promise<void>;
  onToast: (msg: string, variant?: 'default' | 'ok' | 'err' | 'gold') => void;
}

export const TasksView: React.FC<TasksViewProps> = ({
  account,
  sellSettings,
  referralSettings = DEFAULT_REFERRAL_SETTINGS,
  submissions,
  onSubmitAccountSale,
  onToast,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const [sellModal, setSellModal] = useState<AccountPlatform | null>(null);
  const [sellIdentifier, setSellIdentifier] = useState('');
  const [sellPassword, setSellPassword] = useState('');
  const [sellNote, setSellNote] = useState('');
  const [sellError, setSellError] = useState<string | null>(null);

  useEffect(() => {
    if (!sellModal) return;
    const isEnabled =
      sellModal === 'gmail' ? sellSettings.gmailEnabled : sellSettings.facebookEnabled;
    if (!isEnabled) {
      setSellModal(null);
      onToast('এই কাজটি বর্তমানে বন্ধ — শীঘ্রই আসছে', 'gold');
    }
  }, [sellModal, sellSettings, onToast]);

  const openSellModal = (platform: AccountPlatform) => {
    const enabled = platform === 'gmail' ? sellSettings.gmailEnabled : sellSettings.facebookEnabled;
    if (!enabled) {
      onToast('এই কাজটি শীঘ্রই আসছে', 'gold');
      return;
    }
    const presetPassword =
      platform === 'gmail' ? sellSettings.gmailPassword : sellSettings.facebookPassword;
    setSellModal(platform);
    setSellIdentifier('');
    setSellPassword(presetPassword || '');
    setSellNote('');
    setSellError(null);
  };

  const handleSellSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellModal) return;
    setSellError(null);
    const err = validateAccountSubmissionInput(sellModal, sellIdentifier, sellPassword);
    if (err) {
      setSellError(err);
      return;
    }
    const price = sellModal === 'gmail' ? sellSettings.gmailPrice : sellSettings.facebookPrice;
    setSubmitting(true);
    try {
      await onSubmitAccountSale({
        platform: sellModal,
        identifier: sellIdentifier.trim(),
        password: sellPassword.trim(),
        price,
        note: sellModal === 'gmail' ? undefined : sellNote.trim(),
      });
      setSellModal(null);
    } catch (submitErr) {
      setSellError(
        submitErr instanceof Error ? submitErr.message : 'সাবমিট করতে সমস্যা হয়েছে'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      onToast(`${label} কপি হয়েছে`, 'ok');
    } catch {
      onToast('কপি করা যায়নি', 'err');
    }
  };

  const accountSellCards: Array<{
    platform: AccountPlatform;
    title: string;
    icon: string;
    enabled: boolean;
    price: number;
    password: string;
    note: string;
  }> = [
    {
      platform: 'gmail',
      title: 'জিমেইল সেল (Gmail Sell)',
      icon: '📧',
      enabled: sellSettings.gmailEnabled,
      price: sellSettings.gmailPrice,
      password: sellSettings.gmailPassword,
      note: sellSettings.gmailNote,
    },
    {
      platform: 'facebook',
      title: 'ফেসবুক সেল (Facebook Sell)',
      icon: '📘',
      enabled: sellSettings.facebookEnabled,
      price: sellSettings.facebookPrice,
      password: sellSettings.facebookPassword,
      note: sellSettings.facebookNote,
    },
  ];

  const activeSellPrice =
    sellModal === 'gmail' ? sellSettings.gmailPrice : sellSettings.facebookPrice;
  const activeSellAdminPass =
    sellModal === 'gmail' ? sellSettings.gmailPassword : sellSettings.facebookPassword;

  return (
    <div className="space-y-6">
      {/* Featured Account Sell Tasks */}
      <section className="space-y-3.5">
        <div>
          <h2 className="text-lg font-bold">জিমেইল ও ফেসবুক সেল টাস্ক</h2>
          <p className="text-xs text-[var(--muted)]">
            অ্যাডমিন যাচাই করে এপ্রুভ করলে টাকা ব্যালেন্সে যোগ হবে, রিজেক্ট করলে টাকা যোগ হবে না
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accountSellCards.map((card) => (
            <div
              key={card.platform}
              className={`rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5 flex flex-col justify-between gap-4 ${
                !card.enabled ? 'opacity-80' : ''
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-2xl shrink-0">
                      {card.platform === 'gmail' ? card.icon : <FacebookLogo className="w-7 h-7" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold truncate">{card.title}</h3>
                      <p className="text-xs text-[var(--muted)] mt-0.5 line-clamp-2">
                        {card.enabled
                          ? card.note || 'অ্যাকাউন্টের তথ্য সাবমিট করুন'
                          : 'এই কাজটি শীঘ্রই আসছে'}
                      </p>
                    </div>
                  </div>
                  {card.enabled && (
                    <span className="text-sm font-bold font-mono-num text-[var(--emerald)] shrink-0">
                      +৳{toBn(card.price)}
                    </span>
                  )}
                </div>

                {card.enabled && card.password && (
                  <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] text-[var(--muted)]">অ্যাডমিনের নির্ধারিত পাসওয়ার্ড</p>
                      <p className="text-xs font-bold font-mono-num text-[var(--text)] truncate">
                        {card.password}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyText(card.password, 'পাসওয়ার্ড')}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>কপি</span>
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={!card.enabled || submitting}
                onClick={() => openSellModal(card.platform)}
                className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-[var(--primary)] hover:opacity-95 text-white text-xs font-semibold transition-opacity cursor-pointer disabled:bg-[var(--surface-2)] disabled:text-[var(--muted)] disabled:cursor-not-allowed"
              >
                {card.enabled ? `${card.platform === 'gmail' ? 'জিমেইল' : 'ফেসবুক'} সাবমিট করুন` : 'শীঘ্রই আসছে'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* User's Account Sell Submissions Status */}
      {submissions.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-base font-bold">আপনার সাবমিট করা অ্যাকাউন্টসমূহ</h3>
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
            {submissions.slice(0, 10).map((sub) => (
              <div key={sub.id} className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] flex items-center justify-center text-lg shrink-0">
                    {sub.platform === 'gmail' ? '📧' : <FacebookLogo className="w-6 h-6" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {sub.platform === 'gmail' ? 'জিমেইল সেল' : 'ফেসবুক সেল'} ·{' '}
                      <span className="font-mono-num text-[var(--muted)]">{sub.maskedIdentifier}</span>
                    </p>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      {sub.dateLabel}
                      {sub.adminNote ? ` · নোট: ${sub.adminNote}` : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold font-mono-num">৳{fmtAmount(sub.amount)}</p>
                  <p
                    className={`text-xs font-bold flex items-center justify-end gap-1 ${
                      sub.status === 'এপ্রুভড'
                        ? 'text-[var(--emerald)]'
                        : sub.status === 'রিজেক্টেড'
                          ? 'text-[var(--danger)]'
                          : 'text-[var(--gold)]'
                    }`}
                  >
                    {sub.status === 'এপ্রুভড' ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : sub.status === 'রিজেক্টেড' ? (
                      <XCircle className="w-3.5 h-3.5" />
                    ) : (
                      <Clock className="w-3.5 h-3.5" />
                    )}
                    <span>{sub.status}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Referral Invite Card */}
      <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--gold)] shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold">বন্ধু আমন্ত্রণ ও রেফারেল বোনাস</h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              প্রতি সফল রেফারে আপনি{' '}
              <span className="font-bold font-mono-num text-[var(--emerald)]">
                +৳{fmtBnReward(referralSettings.referrerBonus)}
              </span>{' '}
              এবং বন্ধু{' '}
              <span className="font-bold font-mono-num text-[var(--primary)]">
                +৳{fmtBnReward(referralSettings.friendBonus)}
              </span>{' '}
              বোনাস পাবেন
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--primary)] hover:opacity-95 text-white text-xs font-semibold transition-opacity cursor-pointer whitespace-nowrap shrink-0"
        >
          রেফার কোড ও শর্ত দেখুন
        </button>
      </section>

      {/* Gmail / Facebook Sell Submission Modal */}
      <Modal
        open={sellModal !== null}
        onClose={() => setSellModal(null)}
        title={sellModal === 'gmail' ? 'জিমেইল সেল সাবমিট করুন' : 'ফেসবুক সেল সাবমিট করুন'}
      >
        {sellModal && (
          <form onSubmit={handleSellSubmit} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[var(--muted)]">অ্যাপ্রুভাল রিওয়ার্ড</span>
                <span className="font-bold font-mono-num text-[var(--emerald)]">
                  +৳{toBn(activeSellPrice)}
                </span>
              </div>
              {activeSellAdminPass && (
                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[var(--border)]">
                  <span className="text-[var(--muted)]">অ্যাডমিন পাসওয়ার্ড:</span>
                  <span className="font-bold font-mono-num text-[var(--text)]">
                    {activeSellAdminPass}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="sell-identifier" className="block text-xs font-medium text-[var(--muted)] mb-1">
                {sellModal === 'gmail' ? 'জিমেইল ঠিকানা' : 'ফেসবুক আইডি / মোবাইল নম্বর / ইমেইল'}
              </label>
              <input
                id="sell-identifier"
                type={sellModal === 'gmail' ? 'email' : 'text'}
                value={sellIdentifier}
                onChange={(e) => setSellIdentifier(e.target.value)}
                placeholder={sellModal === 'gmail' ? 'example@gmail.com' : '017XXXXXXXX বা ইমেইল'}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
              />
            </div>

            <div>
              <label htmlFor="sell-password" className="block text-xs font-medium text-[var(--muted)] mb-1">
                অ্যাকাউন্টের পাসওয়ার্ড
              </label>
              <input
                id="sell-password"
                type="text"
                value={sellPassword}
                onChange={(e) => setSellPassword(e.target.value)}
                placeholder="কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono-num focus:outline-none focus:border-[var(--primary)]"
              />
            </div>

            {sellModal === 'facebook' && (
              <div>
                <label htmlFor="sell-note" className="block text-xs font-medium text-[var(--muted)] mb-1">
                  কুকিজ (ঐচ্ছিক)
                </label>
                <textarea
                  id="sell-note"
                  rows={2}
                  maxLength={600}
                  value={sellNote}
                  onChange={(e) => setSellNote(e.target.value)}
                  placeholder="ফেসবুক কুকিজ এখানে পেস্ট করুন (যেমন: c_user=...; xs=...)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-mono-num focus:outline-none focus:border-[var(--primary)] resize-y"
                />
              </div>
            )}

            {sellError && (
              <p role="alert" className="text-xs text-[var(--danger)] flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{sellError}</span>
              </p>
            )}

            <p className="text-[11px] text-[var(--muted)] leading-relaxed">
              সাবমিট করার পর এটি পেন্ডিং অবস্থায় চলে যাবে। অ্যাডমিন চেক করে ঠিক পেলে এপ্রুভ করবেন এবং আপনার ব্যালেন্সে টাকা যোগ হবে।
            </p>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[44px] rounded-xl bg-[var(--primary)] text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Mail className="w-4 h-4" />
              <span>{submitting ? 'সাবমিট হচ্ছে...' : 'পেন্ডিং হিসেবে সাবমিট করুন'}</span>
            </button>
          </form>
        )}
      </Modal>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="বন্ধুকে আমন্ত্রণ জানান"
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-[var(--text)]">
            বন্ধুকে আমন্ত্রণ জানালে আপনি{' '}
            <strong className="text-[var(--emerald)] font-mono-num">
              ৳{fmtBnReward(referralSettings.referrerBonus)}
            </strong>{' '}
            পাবেন এবং আপনার বন্ধু{' '}
            <strong className="text-[var(--primary)] font-mono-num">
              ৳{fmtBnReward(referralSettings.friendBonus)}
            </strong>{' '}
            বোনাস পাবে!
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
              <p className="text-[11px] text-[var(--muted)]">আপনি পাবেন</p>
              <p className="text-base font-bold font-mono-num text-[var(--emerald)]">
                +৳{fmtBnReward(referralSettings.referrerBonus)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-[var(--primary)]/10 border border-[var(--primary)]/30 text-center">
              <p className="text-[11px] text-[var(--muted)]">আপনার বন্ধু পাবে</p>
              <p className="text-base font-bold font-mono-num text-[var(--primary)]">
                +৳{fmtBnReward(referralSettings.friendBonus)}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs text-[var(--muted)] mb-1.5">আপনার রেফারেল কোড</p>
            <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[var(--surface-2)] border border-dashed border-[var(--primary)]/50">
              <code className="text-base font-bold font-mono-num tracking-widest text-[var(--primary)]">
                {account.refCode}
              </code>
              <button
                type="button"
                onClick={() => void copyText(account.refCode, 'রেফারেল কোড')}
                className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-[var(--primary)] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>কোড কপি</span>
              </button>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] space-y-1.5">
            <p className="text-xs font-bold text-[var(--text)]">রেফারেলের শর্তাবলি:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs text-[var(--muted)] leading-relaxed">
              <li>
                রেজিস্ট্রেশনের সময় আপনার বন্ধুকে রেফার কোডের ঘরে{' '}
                <strong className="font-mono-num text-[var(--text)]">{account.refCode}</strong> লিখতে হবে।
              </li>
              <li>
                {referralSettings.minTasks > 0
                  ? `বন্ধুকে কমপক্ষে ${toBn(referralSettings.minTasks)}টি দৈনিক চেক-ইন বা কাজ সম্পন্ন করতে হবে, তবেই উভয়ের বোনাস যোগ হবে।`
                  : 'অ্যাকাউন্ট খোলার পর প্রথম কার্যক্রমেই বোনাস আনলক হবে।'}
              </li>
              {referralSettings.conditionNote && <li>{referralSettings.conditionNote}</li>}
            </ol>
          </div>
        </div>
      </Modal>
    </div>
  );
};
