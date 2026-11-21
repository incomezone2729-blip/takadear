import React, { useEffect, useState } from 'react';
import {
  confirmPasswordReset,
  verifyPasswordResetCode,
} from 'firebase/auth';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
} from 'lucide-react';
import { auth } from '../firebase';
import {
  validateConfirmPassword,
  validatePassword,
} from '../utils/takadearLogic';

interface PasswordResetScreenProps {
  oobCode: string;
  onDone: () => void;
  onToast: (msg: string, variant?: 'default' | 'ok' | 'err' | 'gold') => void;
}

function mapResetActionError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  if (code === 'auth/expired-action-code') {
    return 'পাসওয়ার্ড রিসেট লিংকের মেয়াদ শেষ হয়ে গেছে। অনুগ্রহ করে আবার নতুন রিসেট ইমেইল পাঠান।';
  }
  if (code === 'auth/invalid-action-code') {
    return 'পাসওয়ার্ড রিসেট লিংকটি অবৈধ বা ইতিমধ্যেই ব্যবহৃত হয়েছে।';
  }
  if (code === 'auth/weak-password') {
    return 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে';
  }
  if (code === 'auth/user-disabled' || code === 'auth/user-not-found') {
    return 'এই অ্যাকাউন্টটি পাওয়া যায়নি বা নিষ্ক্রিয় করা হয়েছে।';
  }
  return err instanceof Error ? err.message : 'পাসওয়ার্ড রিসেট করা যায়নি';
}

export const PasswordResetScreen: React.FC<PasswordResetScreenProps> = ({
  oobCode,
  onDone,
  onToast,
}) => {
  const [verifying, setVerifying] = useState(true);
  const [targetEmail, setTargetEmail] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let active = true;
    setVerifying(true);
    setVerifyError(null);
    verifyPasswordResetCode(auth, oobCode)
      .then((email) => {
        if (!active) return;
        setTargetEmail(email);
      })
      .catch((err) => {
        if (!active) return;
        setVerifyError(mapResetActionError(err));
      })
      .finally(() => {
        if (active) setVerifying(false);
      });
    return () => {
      active = false;
    };
  }, [oobCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const passErr = validatePassword(newPassword);
    if (passErr) {
      setFormError(passErr);
      return;
    }
    const confirmErr = validateConfirmPassword(newPassword, confirmPassword);
    if (confirmErr) {
      setFormError(confirmErr);
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setCompleted(true);
      onToast('নতুন পাসওয়ার্ড সফলভাবে সেট হয়েছে!', 'ok');
    } catch (err) {
      setFormError(mapResetActionError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-[var(--bg)] text-[var(--text)] flex flex-col items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-md space-y-5">
        <header className="flex items-center justify-center gap-3">
          <img
            src="/logo.png"
            alt="টাকাডিয়ার লোগো"
            className="w-14 h-14 rounded-2xl object-cover shadow-md border border-[var(--border)] shrink-0 select-none"
          />
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-tight">টাকাডিয়ার (TakaDear)</h1>
            <p className="text-xs text-[var(--muted)]">নতুন পাসওয়ার্ড সেটআপ</p>
          </div>
        </header>

        <section className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-6 sm:p-7 shadow-xl space-y-4">
          {verifying ? (
            <div className="py-8 text-center space-y-2">
              <KeyRound className="w-8 h-8 text-[var(--primary)] mx-auto animate-pulse" />
              <p className="text-sm font-medium text-[var(--muted)]">
                রিসেট লিংক যাচাই করা হচ্ছে...
              </p>
            </div>
          ) : verifyError ? (
            <div className="space-y-4">
              <div
                role="alert"
                className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 dark:text-rose-300 text-xs sm:text-sm flex items-start gap-2.5"
              >
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <span>{verifyError}</span>
              </div>
              <button
                type="button"
                onClick={onDone}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>লগইন পেজে ফিরে যান</span>
              </button>
            </div>
          ) : completed ? (
            <div className="space-y-4">
              <div
                role="status"
                className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 text-xs sm:text-sm flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                <span>
                  আপনার পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে। এখন নতুন পাসওয়ার্ড দিয়ে লগইন করুন।
                </span>
              </div>
              <button
                type="button"
                onClick={onDone}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>লগইন করুন</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <h2 className="text-base font-bold">নতুন পাসওয়ার্ড সেট করুন</h2>
                {targetEmail && (
                  <p className="text-xs text-[var(--muted)] mt-1">
                    অ্যাকাউন্ট: <strong className="font-mono-num text-[var(--text)]">{targetEmail}</strong>
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="reset-new-password" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                  নতুন পাসওয়ার্ড
                </label>
                <div className="relative">
                  <input
                    id="reset-new-password"
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="কমপক্ষে ৬ অক্ষর"
                    autoComplete="new-password"
                    required
                    className="w-full min-h-[46px] pl-4 pr-12 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((prev) => !prev)}
                    aria-label={showNew ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখুন'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
                  >
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="reset-confirm-password" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                  কনফার্ম পাসওয়ার্ড
                </label>
                <div className="relative">
                  <input
                    id="reset-confirm-password"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="পুনরায় নতুন পাসওয়ার্ড দিন"
                    autoComplete="new-password"
                    required
                    className="w-full min-h-[46px] pl-4 pr-12 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((prev) => !prev)}
                    aria-label={showConfirm ? 'কনফার্ম পাসওয়ার্ড লুকান' : 'কনফার্ম পাসওয়ার্ড দেখুন'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {formError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 dark:text-rose-300 text-xs flex items-start gap-2.5"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <KeyRound className="w-4 h-4" />
                <span>{submitting ? 'সংরক্ষণ হচ্ছে...' : 'পাসওয়ার্ড পরিবর্তন করুন'}</span>
              </button>

              <button
                type="button"
                onClick={onDone}
                className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)] cursor-pointer"
              >
                লগইন পেজে ফিরে যান
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
};
