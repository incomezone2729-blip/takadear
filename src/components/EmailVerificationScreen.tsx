import React, { useState } from 'react';
import { MailCheck, RefreshCw, Send, LogOut } from 'lucide-react';

interface EmailVerificationScreenProps {
  email: string;
  onResend: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onLogout: () => Promise<void>;
}

export const EmailVerificationScreen: React.FC<EmailVerificationScreenProps> = ({
  email,
  onResend,
  onRefresh,
  onLogout,
}) => {
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-[var(--bg)] text-[var(--text)] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-6 sm:p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)] flex items-center justify-center mx-auto mb-5">
          <MailCheck className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold mb-2">অ্যাডমিন ইমেইল ভেরিফিকেশন প্রয়োজন</h1>
        <p className="text-sm text-[var(--muted)] leading-relaxed mb-6">
          অ্যাডমিন প্যানেলে (<span className="font-semibold text-[var(--text)]">{email}</span>) লগইন করতে ইমেইল ভেরিফাই করা বাধ্যতামূলক। আপনার ইনবক্স বা স্প্যাম ফোল্ডার চেক করে ভেরিফিকেশন লিংকে ক্লিক করুন (সাধারণ ইউজারদের জন্য ভেরিফিকেশন প্রয়োজন নেই)।
        </p>

        <div className="space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(onRefresh)}
            className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            <span>ভেরিফাই সম্পন্ন — এগিয়ে যান</span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => run(onResend)}
            className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>পুনরায় ভেরিফিকেশন ইমেইল পাঠান</span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => run(onLogout)}
            className="w-full min-h-[44px] px-4 py-2 rounded-xl text-rose-500 text-sm font-medium flex items-center justify-center gap-2 hover:bg-rose-500/10 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>লগআউট করুন</span>
          </button>
        </div>
      </div>
    </main>
  );
};
