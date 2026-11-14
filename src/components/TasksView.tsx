import React, { useEffect, useRef, useState } from 'react';
import { Copy, CheckCircle2, Clock, ExternalLink, Mail, ShieldAlert, XCircle } from 'lucide-react';
import type {
  AccountSubmissionRecord,
  UserAccount,
} from '../services/firestoreService';
import {
  buildMergedTasks,
  calculateRemainingSeconds,
  DEFAULT_REFERRAL_SETTINGS,
  DEFAULT_REGULAR_TASK_SETTINGS,
  fmtAmount,
  fmtBnReward,
  QUIZ_DATA,
  SURVEY_DATA,
  toBn,
  validateAccountSubmissionInput,
  type AccountPlatform,
  type AccountSellSettingsConfig,
  type ControllableTaskId,
  type MergedTaskConfig,
  type QuizQuestion,
  type ReferralSettingsConfig,
  type RegularTaskSettingsMap,
  type TaskConfig,
} from '../utils/takadearLogic';
import { Modal } from './Modal';
import { FacebookLogo } from './FacebookLogo';

interface TasksViewProps {
  account: UserAccount;
  sellSettings: AccountSellSettingsConfig;
  regularTaskSettings?: RegularTaskSettingsMap;
  referralSettings?: ReferralSettingsConfig;
  submissions: AccountSubmissionRecord[];
  onCompleteTask: (task: TaskConfig) => Promise<void>;
  onSubmitAccountSale: (params: {
    platform: AccountPlatform;
    identifier: string;
    password: string;
    price: number;
    note?: string;
  }) => Promise<void>;
  onToast: (msg: string, variant?: 'default' | 'ok' | 'err' | 'gold') => void;
}

type ActiveTaskFlow =
  | { kind: 'timer'; task: MergedTaskConfig; startedAtMs: number; secondsLeft: number }
  | { kind: 'visit_confirm'; task: MergedTaskConfig }
  | { kind: 'quiz'; task: MergedTaskConfig; question: QuizQuestion }
  | { kind: 'survey'; task: MergedTaskConfig; step: number }
  | { kind: 'invite'; task: MergedTaskConfig }
  | { kind: 'wrong'; correctAnswer: string }
  | null;

export const TasksView: React.FC<TasksViewProps> = ({
  account,
  sellSettings,
  regularTaskSettings = DEFAULT_REGULAR_TASK_SETTINGS,
  referralSettings = DEFAULT_REFERRAL_SETTINGS,
  submissions,
  onCompleteTask,
  onSubmitAccountSale,
  onToast,
}) => {
  const [flow, setFlow] = useState<ActiveTaskFlow>(null);
  const [submitting, setSubmitting] = useState(false);

  const [sellModal, setSellModal] = useState<AccountPlatform | null>(null);
  const [sellIdentifier, setSellIdentifier] = useState('');
  const [sellPassword, setSellPassword] = useState('');
  const [sellNote, setSellNote] = useState('');
  const [sellError, setSellError] = useState<string | null>(null);

  const onCompleteTaskRef = useRef(onCompleteTask);
  onCompleteTaskRef.current = onCompleteTask;
  const completedTimerKeyRef = useRef<string | null>(null);

  const activeTimerTask = flow?.kind === 'timer' ? flow.task : null;
  const activeTimerStart = flow?.kind === 'timer' ? flow.startedAtMs : 0;

  useEffect(() => {
    if (!flow) return;
    if (
      flow.kind === 'timer' ||
      flow.kind === 'visit_confirm' ||
      flow.kind === 'quiz' ||
      flow.kind === 'survey'
    ) {
      const id = flow.task.id;
      if (id !== 'invite') {
        const cfg = regularTaskSettings[id as ControllableTaskId];
        if (cfg && !cfg.enabled) {
          setFlow(null);
          onToast('এই কাজটি বর্তমানে বন্ধ — শীঘ্রই আসছে', 'gold');
        }
      }
    }
  }, [flow, regularTaskSettings, onToast]);

  useEffect(() => {
    if (!sellModal) return;
    const isEnabled =
      sellModal === 'gmail' ? sellSettings.gmailEnabled : sellSettings.facebookEnabled;
    if (!isEnabled) {
      setSellModal(null);
      onToast('এই কাজটি বর্তমানে বন্ধ — শীঘ্রই আসছে', 'gold');
    }
  }, [sellModal, sellSettings, onToast]);

  useEffect(() => {
    if (!activeTimerTask || !activeTimerStart) return;
    const timerKey = `${activeTimerTask.id}:${activeTimerStart}`;
    let settled = false;
    const syncTimer = () => {
      if (settled || completedTimerKeyRef.current === timerKey) return;
      const rem = calculateRemainingSeconds(activeTimerStart, activeTimerTask.timer);
      if (rem <= 0) {
        settled = true;
        completedTimerKeyRef.current = timerKey;
        setFlow(null);
        setSubmitting(true);
        void onCompleteTaskRef.current(activeTimerTask).finally(() => setSubmitting(false));
      } else {
        setFlow((prev) =>
          prev && prev.kind === 'timer' && prev.secondsLeft !== rem
            ? { ...prev, secondsLeft: rem }
            : prev
        );
      }
    };

    syncTimer();
    const interval = window.setInterval(syncTimer, 250);
    window.addEventListener('focus', syncTimer);
    document.addEventListener('visibilitychange', syncTimer);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', syncTimer);
      document.removeEventListener('visibilitychange', syncTimer);
    };
  }, [activeTimerTask, activeTimerStart]);

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

  const startTask = (task: MergedTaskConfig) => {
    if (submitting || flow !== null) return;
    if (!task.enabled) {
      onToast('এই কাজটি শীঘ্রই আসছে', 'gold');
      return;
    }
    const done = account.dailyTasks?.[task.id] || 0;
    if (done >= task.limit) {
      onToast('আজকের জন্য এই টাস্কের সীমা শেষ', 'err');
      return;
    }

    if (task.id === 'invite') {
      setFlow({ kind: 'invite', task });
      return;
    }

    if (task.url) {
      if (task.timer > 0) {
        setFlow({ kind: 'timer', task, startedAtMs: Date.now(), secondsLeft: task.timer });
      } else {
        setFlow({ kind: 'visit_confirm', task });
      }
      return;
    }

    if (task.id === 'quiz') {
      const question = QUIZ_DATA[Math.floor(Math.random() * QUIZ_DATA.length)];
      setFlow({ kind: 'quiz', task, question });
    } else if (task.id === 'survey') {
      setFlow({ kind: 'survey', task, step: 0 });
    } else {
      setFlow({ kind: 'timer', task, startedAtMs: Date.now(), secondsLeft: task.timer });
    }
  };

  const handleConfirmVisit = async () => {
    if (submitting || !flow || flow.kind !== 'visit_confirm') return;
    const t = flow.task;
    setFlow(null);
    setSubmitting(true);
    try {
      await onCompleteTaskRef.current(t);
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuizAnswer = async (index: number) => {
    if (submitting || !flow || flow.kind !== 'quiz') return;
    if (index === flow.question.ans) {
      const t = flow.task;
      setFlow(null);
      setSubmitting(true);
      try {
        await onCompleteTaskRef.current(t);
      } finally {
        setSubmitting(false);
      }
    } else {
      setFlow({
        kind: 'wrong',
        correctAnswer: flow.question.opts[flow.question.ans],
      });
    }
  };

  const handleSurveyAnswer = async () => {
    if (submitting || !flow || flow.kind !== 'survey') return;
    const nextStep = flow.step + 1;
    if (nextStep >= SURVEY_DATA.length) {
      const t = flow.task;
      setFlow(null);
      setSubmitting(true);
      try {
        await onCompleteTaskRef.current(t);
      } finally {
        setSubmitting(false);
      }
    } else {
      setFlow({ ...flow, step: nextStep });
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
  const mergedTasks = buildMergedTasks(regularTaskSettings, referralSettings);

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

      {/* Daily Earning Tasks */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">দৈনিক আর্নিং টাস্কসমূহ</h2>
            <p className="text-xs text-[var(--muted)]">প্রতিদিন রাত ১২টায় দৈনিক সীমা রিসেট হয়</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {mergedTasks.map((task) => {
            const done = account.dailyTasks?.[task.id] || 0;
            const remaining = Math.max(0, task.limit - done);
            const finished = task.enabled && remaining === 0;
            const hasExternalLink = Boolean(task.enabled && !finished && task.url);

            return (
              <div
                key={task.id}
                className={`rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-5 flex items-center justify-between gap-4 ${
                  !task.enabled ? 'opacity-80' : ''
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-2xl shrink-0">
                    {task.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold truncate">{task.title}</h3>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      {!task.enabled ? (
                        'এই কাজটি শীঘ্রই আসছে'
                      ) : (
                        <>
                          {task.desc} · বাকি{' '}
                          <span className="font-mono-num">
                            {toBn(remaining)}/{toBn(task.limit)}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {task.enabled && (
                    <span className="text-xs font-bold font-mono-num text-[var(--emerald)]">
                      +৳{fmtBnReward(task.reward)}
                    </span>
                  )}

                  {!task.enabled ? (
                    <button
                      type="button"
                      disabled
                      className="min-h-[40px] px-4 py-1.5 rounded-xl bg-[var(--surface-2)] text-[var(--muted)] border border-[var(--border)] text-xs font-semibold cursor-not-allowed whitespace-nowrap"
                    >
                      শীঘ্রই আসছে
                    </button>
                  ) : hasExternalLink ? (
                    <a
                      href={task.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        if (submitting) {
                          e.preventDefault();
                          return;
                        }
                        startTask(task);
                      }}
                      className="min-h-[40px] px-4 py-1.5 rounded-xl bg-[var(--primary)] hover:opacity-95 text-white text-xs font-semibold transition-opacity inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <span>শুরু করুন</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled={finished || submitting}
                      onClick={() => startTask(task)}
                      className="min-h-[40px] px-4 py-1.5 rounded-xl bg-[var(--primary)] hover:opacity-95 text-white text-xs font-semibold transition-opacity cursor-pointer disabled:bg-[var(--surface-2)] disabled:text-[var(--muted)] disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {finished ? 'সম্পন্ন' : 'শুরু করুন'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
        open={flow !== null}
        onClose={() => setFlow(null)}
        title={
          flow?.kind === 'timer' || flow?.kind === 'visit_confirm'
            ? flow.task.title
            : flow?.kind === 'quiz'
              ? 'দৈনিক কুইজ'
              : flow?.kind === 'survey'
                ? `সার্ভে প্রশ্ন ${toBn(flow.step + 1)}/${toBn(SURVEY_DATA.length)}`
                : flow?.kind === 'invite'
                  ? 'বন্ধুকে আমন্ত্রণ জানান'
                  : 'সঠিক উত্তর'
        }
      >
        {flow?.kind === 'timer' && (
          <div className="text-center py-2 space-y-4">
            <div className="text-4xl">{flow.task.icon}</div>
            <p className="text-sm text-[var(--muted)]">
              {flow.task.url
                ? 'খোলা লিংকটি নির্ধারিত সময় পর্যন্ত ভিজিট করুন; সময় শেষ হলেই পুরস্কার ব্যালেন্সে যোগ হবে'
                : 'পুরস্কার নিশ্চিত করতে নিচের সময় শেষ হওয়া পর্যন্ত অপেক্ষা করুন'}
            </p>
            <div className="text-4xl font-bold font-mono-num text-[var(--primary)]">
              {toBn(flow.secondsLeft)} সেকেন্ড
            </div>
            <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
              <div
                className="h-full bg-[var(--primary)] transition-all duration-300 linear"
                style={{
                  width: `${Math.round(((flow.task.timer - flow.secondsLeft) / Math.max(1, flow.task.timer)) * 100)}%`,
                }}
              />
            </div>
            {flow.task.url && (
              <a
                href={flow.task.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--primary)] text-xs font-semibold text-[var(--text)]"
              >
                <span>লিংকটি পুনরায় খুলুন</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}

        {flow?.kind === 'visit_confirm' && (
          <div className="text-center py-2 space-y-4">
            <div className="text-4xl">{flow.task.icon}</div>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              লিংকটি দেখা সম্পন্ন হয়ে থাকলে নিচের বাটনে ক্লিক করে +৳{fmtBnReward(flow.task.reward)} পুরস্কার সংগ্রহ করুন।
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleConfirmVisit()}
                className="w-full min-h-[44px] rounded-xl bg-[var(--primary)] text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'যোগ হচ্ছে...' : 'পুরস্কার সংগ্রহ করুন'}
              </button>
              {flow.task.url && (
                <a
                  href={flow.task.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-semibold text-[var(--muted)]"
                >
                  <span>আবার লিংক খুলুন</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        )}

        {flow?.kind === 'quiz' && (
          <div className="space-y-2.5">
            <p className="text-sm font-semibold mb-3">{flow.question.q}</p>
            {flow.question.opts.map((opt, idx) => (
              <button
                key={opt}
                type="button"
                disabled={submitting}
                onClick={() => handleQuizAnswer(idx)}
                className="w-full min-h-[44px] text-left px-4 py-2.5 rounded-xl bg-[var(--surface-2)] hover:border-[var(--primary)] border border-[var(--border)] text-sm font-medium cursor-pointer transition-colors disabled:opacity-50"
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {flow?.kind === 'survey' && (
          <div className="space-y-2.5">
            <p className="text-sm font-semibold mb-3">{SURVEY_DATA[flow.step].q}</p>
            {SURVEY_DATA[flow.step].opts.map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={submitting}
                onClick={handleSurveyAnswer}
                className="w-full min-h-[44px] text-left px-4 py-2.5 rounded-xl bg-[var(--surface-2)] hover:border-[var(--primary)] border border-[var(--border)] text-sm font-medium cursor-pointer transition-colors disabled:opacity-50"
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {flow?.kind === 'invite' && (
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
                    ? `বন্ধুকে কমপক্ষে ${toBn(referralSettings.minTasks)}টি টাস্ক বা স্পিন সম্পন্ন করতে হবে, তবেই উভয়ের বোনাস যোগ হবে।`
                    : 'অ্যাকাউন্ট খোলার পর প্রথম কার্যক্রমেই বোনাস আনলক হবে।'}
                </li>
                {referralSettings.conditionNote && <li>{referralSettings.conditionNote}</li>}
              </ol>
            </div>
          </div>
        )}

        {flow?.kind === 'wrong' && (
          <div className="text-center space-y-4">
            <p className="text-sm text-[var(--muted)]">
              ভুল উত্তর! সঠিক উত্তর: <strong className="text-[var(--text)]">{flow.correctAnswer}</strong>
            </p>
            <button
              type="button"
              onClick={() => setFlow(null)}
              className="w-full min-h-[44px] rounded-xl bg-[var(--primary)] text-white text-sm font-semibold cursor-pointer"
            >
              ঠিক আছে
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
};
