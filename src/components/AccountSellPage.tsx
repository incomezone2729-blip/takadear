import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  ListChecks,
  Mail,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import type { AccountSubmissionRecord } from '../services/firestoreService';
import {
  filterAccountSubmissionsByPlatform,
  fmtAmount,
  toBn,
  validateAccountSubmissionInput,
  type AccountPlatform,
  type AccountSellSettingsConfig,
} from '../utils/takadearLogic';
import { FacebookLogo } from './FacebookLogo';

interface AccountSellPageProps {
  platform: AccountPlatform;
  sellSettings: AccountSellSettingsConfig;
  submissions: AccountSubmissionRecord[];
  onSubmitAccountSale: (params: {
    platform: AccountPlatform;
    identifier: string;
    password: string;
    price: number;
    note?: string;
  }) => Promise<void>;
  onBackHome: () => void;
  onGoTasks: () => void;
  onToast: (msg: string, variant?: 'default' | 'ok' | 'err' | 'gold') => void;
}

export const AccountSellPage: React.FC<AccountSellPageProps> = ({
  platform,
  sellSettings,
  submissions,
  onSubmitAccountSale,
  onBackHome,
  onGoTasks,
  onToast,
}) => {
  const isGmail = platform === 'gmail';
  const enabled = isGmail ? sellSettings.gmailEnabled : sellSettings.facebookEnabled;
  const price = isGmail ? sellSettings.gmailPrice : sellSettings.facebookPrice;
  const presetPassword = isGmail ? sellSettings.gmailPassword : sellSettings.facebookPassword;
  const adminNote = isGmail ? sellSettings.gmailNote : sellSettings.facebookNote;

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState(presetPassword || '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setIdentifier('');
    setPassword(presetPassword || '');
    setNote('');
    setError(null);
  }, [platform, presetPassword]);

  const platformSubmissions = filterAccountSubmissionsByPlatform(submissions, platform);

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      onToast(`${label} কপি হয়েছে`, 'ok');
    } catch {
      onToast('কপি করা যায়নি', 'err');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enabled) {
      setError('এই কাজটি বর্তমানে বন্ধ — শীঘ্রই আসছে');
      return;
    }
    setError(null);
    const validationErr = validateAccountSubmissionInput(platform, identifier, password);
    if (validationErr) {
      setError(validationErr);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmitAccountSale({
        platform,
        identifier: identifier.trim(),
        password: password.trim(),
        price,
        note: isGmail ? undefined : note.trim(),
      });
      setIdentifier('');
      setNote('');
      setPassword(presetPassword || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'সাবমিট করতে সমস্যা হয়েছে');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation & Back Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackHome}
          className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>হোমে ফিরে যান</span>
        </button>

        <button
          type="button"
          onClick={onGoTasks}
          className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
        >
          <ListChecks className="w-4 h-4 text-[var(--primary)]" />
          <span>সকল টাস্ক দেখুন</span>
        </button>
      </div>

      {/* Platform Header Card */}
      <section className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-3xl shrink-0">
              {isGmail ? '📧' : <FacebookLogo className="w-9 h-9" />}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold">
                  {isGmail ? 'জিমেইল কাজ (Gmail Sell)' : 'ফেসবুক কাজ (Facebook Sell)'}
                </h1>
                <span
                  className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-md ${
                    enabled
                      ? 'bg-emerald-500/15 text-[var(--emerald)]'
                      : 'bg-amber-500/15 text-[var(--gold)]'
                  }`}
                >
                  {enabled ? 'চালু আছে' : 'শীঘ্রই আসছে'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[var(--muted)] mt-1 leading-relaxed">
                {!enabled
                  ? 'এই কাজটি বর্তমানে বন্ধ রয়েছে — শীঘ্রই আসছে'
                  : adminNote ||
                    (isGmail
                      ? 'নতুন জিমেইল তৈরি করে নিচের ফর্মে সাবমিট করুন। অ্যাডমিন যাচাই করে এপ্রুভ করলে টাকা পাবেন।'
                      : 'সক্রিয় ফেসবুক অ্যাকাউন্ট সাবমিট করুন। অ্যাডমিন যাচাই করে এপ্রুভ করলে টাকা পাবেন।')}
              </p>
            </div>
          </div>

          {enabled && (
            <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] px-4 py-2.5 text-right shrink-0">
              <span className="block text-[11px] text-[var(--muted)]">প্রতি অ্যাকাউন্ট</span>
              <span className="text-xl font-bold font-mono-num text-[var(--emerald)]">
                +৳{toBn(price)}
              </span>
            </div>
          )}
        </div>

        {enabled && presetPassword && (
          <div className="mt-5 p-3.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-[var(--muted)]">অ্যাডমিনের নির্ধারিত পাসওয়ার্ড</p>
              <p className="text-sm font-bold font-mono-num text-[var(--text)] truncate mt-0.5">
                {presetPassword}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void copyText(presetPassword, 'পাসওয়ার্ড')}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>পাসওয়ার্ড কপি</span>
            </button>
          </div>
        )}
      </section>

      {/* Main Split: Submission Form + Platform History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <section className="lg:col-span-6 rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6">
          <h2 className="text-base font-bold mb-1">
            {isGmail ? 'জিমেইল অ্যাকাউন্ট সাবমিট করুন' : 'ফেসবুক অ্যাকাউন্ট সাবমিট করুন'}
          </h2>
          {!enabled ? (
            <div className="mt-3 space-y-4">
              <div className="p-5 rounded-2xl bg-[var(--surface-2)] border border-dashed border-amber-500/40 text-center space-y-1.5">
                <p className="text-sm font-bold text-[var(--gold)]">শীঘ্রই আসছে</p>
                <p className="text-xs text-[var(--muted)] leading-relaxed">
                  অ্যাডমিন কাজটি পুনরায় চালু করলে এখান থেকেই তথ্য সাবমিট করতে পারবেন।
                </p>
              </div>
              <button
                type="button"
                disabled
                className="w-full min-h-[46px] rounded-xl bg-[var(--surface-2)] text-[var(--muted)] border border-[var(--border)] text-sm font-semibold cursor-not-allowed"
              >
                শীঘ্রই আসছে
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs text-[var(--muted)] mb-4">
                সাবমিট করার পর স্ট্যাটাস পেন্ডিং থাকবে। অ্যাডমিন ঠিক পেলে এপ্রুভ করে ব্যালেন্সে ৳{toBn(price)} যোগ করবেন।
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="dedicated-sell-identifier"
                    className="block text-xs font-medium text-[var(--muted)] mb-1"
                  >
                    {isGmail ? 'জিমেইল ঠিকানা' : 'ফেসবুক আইডি / মোবাইল নম্বর / ইমেইল'}
                  </label>
                  <input
                    id="dedicated-sell-identifier"
                    type={isGmail ? 'email' : 'text'}
                    disabled={submitting}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={isGmail ? 'example@gmail.com' : '017XXXXXXXX বা ইমেইল বা আইডি'}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)] disabled:opacity-60"
                  />
                </div>

                <div>
                  <label
                    htmlFor="dedicated-sell-password"
                    className="block text-xs font-medium text-[var(--muted)] mb-1"
                  >
                    অ্যাকাউন্টের পাসওয়ার্ড
                  </label>
                  <input
                    id="dedicated-sell-password"
                    type="text"
                    disabled={submitting}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono-num focus:outline-none focus:border-[var(--primary)] disabled:opacity-60"
                  />
                </div>

                {!isGmail && (
                  <div>
                    <label
                      htmlFor="dedicated-sell-cookies"
                      className="block text-xs font-medium text-[var(--muted)] mb-1"
                    >
                      কুকিজ (ঐচ্ছিক)
                    </label>
                    <textarea
                      id="dedicated-sell-cookies"
                      rows={2}
                      maxLength={600}
                      disabled={submitting}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="ফেসবুক কুকিজ এখানে পেস্ট করুন (যেমন: c_user=...; xs=...)"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-mono-num focus:outline-none focus:border-[var(--primary)] disabled:opacity-60 resize-y"
                    />
                  </div>
                )}

                {error && (
                  <p role="alert" className="text-xs text-[var(--danger)] flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[46px] rounded-xl bg-[var(--primary)] hover:opacity-95 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-opacity cursor-pointer disabled:bg-[var(--surface-2)] disabled:text-[var(--muted)] disabled:cursor-not-allowed"
                >
                  <Mail className="w-4 h-4" />
                  <span>
                    {submitting
                      ? 'সাবমিট হচ্ছে...'
                      : `${isGmail ? 'জিমেইল' : 'ফেসবুক'} পেন্ডিং হিসেবে সাবমিট করুন`}
                  </span>
                </button>
              </form>
            </>
          )}
        </section>

        <section className="lg:col-span-6 rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-base font-bold">
              {isGmail ? 'আপনার জিমেইল সাবমিশনসমূহ' : 'আপনার ফেসবুক সাবমিশনসমূহ'}
            </h2>
            <span className="text-xs font-mono-num text-[var(--muted)]">
              মোট {toBn(platformSubmissions.length)}টি
            </span>
          </div>

          {platformSubmissions.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[var(--surface-2)] border border-dashed border-[var(--border)] text-center text-xs sm:text-sm text-[var(--muted)]">
              আপনি এখনো কোনো {isGmail ? 'জিমেইল' : 'ফেসবুক'} অ্যাকাউন্ট সাবমিট করেননি
            </div>
          ) : (
            <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] divide-y divide-[var(--border)]">
              {platformSubmissions.slice(0, 15).map((sub) => (
                <div key={sub.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold font-mono-num truncate">
                      {sub.maskedIdentifier}
                    </p>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      {sub.dateLabel}
                      {sub.adminNote ? ` · নোট: ${sub.adminNote}` : ''}
                    </p>
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
          )}
        </section>
      </div>
    </div>
  );
};
