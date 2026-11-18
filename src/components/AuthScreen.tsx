import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  DEFAULT_REFERRAL_SETTINGS,
  fmtBnReward,
  validateConfirmPassword,
  validateEmail,
  validatePassword,
  validateUserName,
  type ReferralSettingsConfig,
} from '../utils/takadearLogic';

interface AuthScreenProps {
  initialRefCode: string;
  referralSettings?: ReferralSettingsConfig;
  onEmailAuth: (params: {
    mode: 'signup' | 'login';
    name: string;
    email: string;
    password: string;
    refCode: string;
  }) => Promise<void>;
  onPasswordReset: (email: string) => Promise<void>;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  initialRefCode,
  referralSettings = DEFAULT_REFERRAL_SETTINGS,
  onEmailAuth,
  onPasswordReset,
}) => {
  const [mode, setMode] = useState<'login' | 'signup'>(initialRefCode ? 'signup' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [refCode, setRefCode] = useState(initialRefCode);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [suggestLoginSwitch, setSuggestLoginSwitch] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (next: 'login' | 'signup') => {
    setMode(next);
    setErrorMsg(null);
    setInfoMsg(null);
    setSuggestLoginSwitch(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);
    setSuggestLoginSwitch(false);

    if (mode === 'signup') {
      const nameErr = validateUserName(name);
      if (nameErr) {
        setErrorMsg(nameErr);
        return;
      }
    }

    const emailErr = validateEmail(email);
    if (emailErr) {
      setErrorMsg(emailErr);
      return;
    }

    const passErr = validatePassword(password);
    if (passErr) {
      setErrorMsg(passErr);
      return;
    }

    if (mode === 'signup') {
      const confirmErr = validateConfirmPassword(password, confirmPassword);
      if (confirmErr) {
        setErrorMsg(confirmErr);
        return;
      }
    }

    setSubmitting(true);
    try {
      await onEmailAuth({
        mode,
        name: name.trim(),
        email: email.trim(),
        password,
        refCode: refCode.trim().toUpperCase(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'অথেনটিকেশন ব্যর্থ হয়েছে';
      setErrorMsg(msg);
      if (mode === 'signup' && msg.includes('ইতিমধ্যেই নিবন্ধিত')) {
        setSuggestLoginSwitch(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    const emailErr = validateEmail(email);
    if (emailErr) {
      setErrorMsg('পাসওয়ার্ড রিসেট করতে প্রথমে আপনার নিবন্ধিত ইমেইল লিখুন');
      return;
    }
    setSubmitting(true);
    try {
      await onPasswordReset(email.trim());
      setInfoMsg('আপনার ইমেইলে পাসওয়ার্ড রিসেট লিংক পাঠানো হয়েছে (ইনবক্স বা স্প্যাম চেক করুন)।');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'পাসওয়ার্ড রিসেট ইমেইল পাঠানো যায়নি');
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
            <p className="text-xs text-[var(--muted)]">দৈনিক চেক-ইন, অ্যাকাউন্ট কাজ ও রিওয়ার্ড ওয়ালেট</p>
          </div>
        </header>

        <section className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-6 sm:p-7 shadow-xl">
          {/* Left: Login | Right: Account Registration */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] mb-6">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap px-2 ${
                mode === 'login'
                  ? 'bg-[var(--primary)] text-white shadow-sm'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              লগইন করুন
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap px-2 ${
                mode === 'signup'
                  ? 'bg-[var(--primary)] text-white shadow-sm'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              রেজিস্ট্রেশন
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {mode === 'signup' && (
              <div>
                <label htmlFor="auth-name" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                  নাম
                </label>
                <input
                  id="auth-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="আপনার পুরো নাম লিখুন"
                  autoComplete="name"
                  required
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
                />
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                ইমেইল
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor="auth-password" className="block text-xs font-medium text-[var(--muted)]">
                  পাসওয়ার্ড
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleForgotPassword}
                    className="text-xs font-medium text-[var(--primary)] hover:underline cursor-pointer disabled:opacity-50"
                  >
                    পাসওয়ার্ড ভুলে গেছেন?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="কমপক্ষে ৬ অক্ষর"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                  className="w-full min-h-[46px] pl-4 pr-12 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখুন'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <>
                <div>
                  <label
                    htmlFor="auth-confirm-password"
                    className="block text-xs font-medium text-[var(--muted)] mb-1.5"
                  >
                    কনফার্ম পাসওয়ার্ড
                  </label>
                  <div className="relative">
                    <input
                      id="auth-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="পুনরায় পাসওয়ার্ড দিন"
                      autoComplete="new-password"
                      required
                      className="w-full min-h-[46px] pl-4 pr-12 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      aria-label={showConfirmPassword ? 'কনফার্ম পাসওয়ার্ড লুকান' : 'কনফার্ম পাসওয়ার্ড দেখুন'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="auth-ref" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                    রেফার কোড (ঐচ্ছিক)
                  </label>
                  <input
                    id="auth-ref"
                    type="text"
                    value={refCode}
                    onChange={(e) => setRefCode(e.target.value.toUpperCase())}
                    placeholder="বন্ধুর কোড থাকলে লিখুন"
                    className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm uppercase font-mono-num text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 dark:text-rose-300 text-xs space-y-2"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
                {suggestLoginSwitch && (
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="inline-flex items-center gap-1 font-semibold underline cursor-pointer"
                  >
                    <span>এই ইমেইল দিয়ে লগইন করুন →</span>
                  </button>
                )}
              </div>
            )}

            {infoMsg && (
              <div
                role="status"
                className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 dark:text-emerald-300 text-xs flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{infoMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[var(--primary)] hover:opacity-95 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-md transition-opacity cursor-pointer disabled:opacity-50"
            >
              <span>
                {submitting
                  ? 'অপেক্ষা করুন...'
                  : mode === 'signup'
                    ? 'অ্যাকাউন্ট রেজিস্ট্রেশন করুন'
                    : 'লগইন করুন'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-[var(--muted)] leading-relaxed">
            বন্ধুকে আমন্ত্রণ জানালে আপনি ৳{fmtBnReward(referralSettings.referrerBonus)} এবং আপনার বন্ধু ৳{fmtBnReward(referralSettings.friendBonus)} পাবেন (শর্ত প্রযোজ্য) · সর্বনিম্ন উত্তোলন ১০০৳
          </p>
        </section>
      </div>
    </main>
  );
};
