import React from 'react';
import { Gift, Tv, Landmark, Users, Flame, Check, Mail, MessageCircle } from 'lucide-react';
import { FacebookLogo } from './FacebookLogo';
import type { TransactionRecord, UserAccount } from '../services/firestoreService';
import {
  DEFAULT_ACCOUNT_SELL_SETTINGS,
  DEFAULT_REGULAR_TASK_SETTINGS,
  fmtAmount,
  fmtBnReward,
  getActiveStreakDisplay,
  SPIN_LIMIT,
  STREAK_BONUS,
  toBn,
  todayKey,
  yesterdayKey,
  type AccountSellSettingsConfig,
  type RegularTaskSettingsMap,
} from '../utils/takadearLogic';

export type NavPage =
  | 'home'
  | 'tasks'
  | 'spin'
  | 'wallet'
  | 'profile'
  | 'gmail-task'
  | 'facebook-task'
  | 'support';

interface HomeViewProps {
  account: UserAccount;
  transactions: TransactionRecord[];
  sellSettings?: AccountSellSettingsConfig;
  regularTaskSettings?: RegularTaskSettingsMap;
  busy: boolean;
  onNavigate: (page: NavPage) => void;
  onCheckin: () => Promise<void>;
}

export const HomeView: React.FC<HomeViewProps> = ({
  account,
  transactions,
  sellSettings = DEFAULT_ACCOUNT_SELL_SETTINGS,
  regularTaskSettings = DEFAULT_REGULAR_TASK_SETTINGS,
  busy,
  onNavigate,
  onCheckin,
}) => {
  const today = todayKey();
  const yesterday = yesterdayKey();
  const streakDisplay = getActiveStreakDisplay(
    account.streakLast,
    account.streakCount,
    today,
    yesterday
  );
  const checkedToday = streakDisplay.checkedToday;
  const totalTasksDone = Object.values(account.dailyTasks || {}).reduce((acc, v) => acc + v, 0);
  const spinsRemaining = Math.max(0, SPIN_LIMIT - (account.dailySpins || 0));

  return (
    <div className="space-y-6">
      {/* Top 2-column split on desktop: Hero Balance + Daily Check-in */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <section className="lg:col-span-7 rounded-3xl p-6 sm:p-7 bg-gradient-to-br from-[#5b4cdb] via-[#6c5ce7] to-[#2e86de] text-white flex flex-col justify-between shadow-lg">
          <div>
            <p className="text-sm text-white/85 font-medium">মোট বর্তমান ব্যালেন্স</p>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold text-white/85">৳</span>
              <span className="text-4xl sm:text-5xl font-bold font-mono-num tracking-tight">
                {fmtAmount(account.balance)}
              </span>
            </div>
          </div>

          <div className="mt-7 pt-5 border-t border-white/20 grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-white/80">মোট আয়</p>
              <p className="text-lg font-bold font-mono-num mt-0.5">৳{fmtAmount(account.totalEarned)}</p>
            </div>
            <div>
              <p className="text-xs text-white/80">রেফারেল</p>
              <p className="text-lg font-bold font-mono-num mt-0.5">{toBn(account.referrals)} জন</p>
            </div>
            <div>
              <p className="text-xs text-white/80">চেক-ইন স্ট্রিক</p>
              <p className="text-lg font-bold font-mono-num mt-0.5">{toBn(streakDisplay.effectiveCount)} দিন</p>
            </div>
          </div>
        </section>

        <section className="lg:col-span-5 rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Flame className="w-4 h-4 text-[var(--gold)]" />
                <span>দৈনিক চেক-ইন বোনাস</span>
              </h2>
              <span className="text-xs text-[var(--muted)]">
                {checkedToday ? 'আজ সম্পন্ন' : 'আজ বাকি'}
              </span>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {STREAK_BONUS.map((bonus, idx) => {
                const done = idx < streakDisplay.completedInCycle;
                const isNext = !checkedToday && idx === streakDisplay.nextIndex;
                return (
                  <div
                    key={idx}
                    className={`rounded-xl py-2.5 px-0.5 sm:px-1 text-center border text-[10px] sm:text-[11px] flex flex-col items-center justify-center gap-0.5 ${
                      done
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-[var(--emerald)] font-semibold'
                        : isNext
                          ? 'bg-amber-500/15 border-amber-500/60 text-[var(--gold)] font-semibold'
                          : 'bg-[var(--surface-2)] border-transparent text-[var(--muted)]'
                    }`}
                  >
                    <span className="font-mono-num">{toBn(idx + 1)}</span>
                    <span className="font-mono-num">৳{fmtBnReward(bonus)}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-[var(--muted)] mt-2.5">
              টানা ৭ দিন চেক-ইন করুন; একদিন মিস করলে আবার Day ১ (৳০.০৫) থেকে শুরু হবে।
            </p>
          </div>

          <button
            type="button"
            disabled={checkedToday || busy}
            onClick={onCheckin}
            className="mt-5 w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {checkedToday ? (
              <>
                <Check className="w-4 h-4" />
                <span>আজকের বোনাস নেওয়া হয়েছে</span>
              </>
            ) : (
              <>
                <Gift className="w-4 h-4" />
                <span>আজকের বোনাস সংগ্রহ করুন</span>
              </>
            )}
          </button>
        </section>
      </div>

      {/* Quick Actions */}
      <section aria-label="দ্রুত কাজ">
        <h2 className="text-base font-bold mb-3">দ্রুত কাজ</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <button
            type="button"
            onClick={() => onNavigate('gmail-task')}
            className="min-h-[90px] rounded-2xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] p-3.5 flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Mail className="w-6 h-6 text-rose-400" />
            <span className="text-xs font-semibold">জিমেইল কাজ</span>
            <span
              className={`text-[11px] font-bold font-mono-num ${
                sellSettings.gmailEnabled ? 'text-[var(--emerald)]' : 'text-[var(--muted)]'
              }`}
            >
              {sellSettings.gmailEnabled ? `+৳${toBn(sellSettings.gmailPrice)}` : 'শীঘ্রই আসছে'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('facebook-task')}
            className="min-h-[90px] rounded-2xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] p-3.5 flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <FacebookLogo className="w-7 h-7" />
            <span className="text-xs font-semibold">ফেসবুক কাজ</span>
            <span
              className={`text-[11px] font-bold font-mono-num ${
                sellSettings.facebookEnabled ? 'text-[var(--emerald)]' : 'text-[var(--muted)]'
              }`}
            >
              {sellSettings.facebookEnabled ? `+৳${toBn(sellSettings.facebookPrice)}` : 'শীঘ্রই আসছে'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('spin')}
            className="min-h-[90px] rounded-2xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] p-3.5 flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <span className="text-2xl leading-none" aria-hidden="true">🎡</span>
            <span className="text-xs font-semibold">লাকি স্পিন</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('tasks')}
            className="min-h-[90px] rounded-2xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] p-3.5 flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Tv className="w-6 h-6 text-[var(--primary)]" />
            <span className="text-xs font-semibold">বিজ্ঞাপন ও টাস্ক</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('wallet')}
            className="min-h-[90px] rounded-2xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] p-3.5 flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Landmark className="w-6 h-6 text-[var(--emerald)]" />
            <span className="text-xs font-semibold">টাকা উত্তোলন</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="min-h-[90px] rounded-2xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] p-3.5 flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Users className="w-6 h-6 text-[var(--gold)]" />
            <span className="text-xs font-semibold">রেফার ও বোনাস</span>
          </button>
        </div>
      </section>

      {/* Live Support Quick Card */}
      <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[var(--primary)]/15 text-[var(--primary)] flex items-center justify-center shrink-0">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold">লাইভ সাপোর্ট</h2>
            <p className="text-xs text-[var(--muted)] truncate">
              যেকোনো সমস্যা বা সাহায্যের জন্য সরাসরি অ্যাডমিনকে মেসেজ করুন
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('support')}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-xs font-semibold whitespace-nowrap cursor-pointer shrink-0"
        >
          মেসেজ করুন
        </button>
      </section>

      {/* Today's Stats + Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-5">
          <h2 className="text-base font-bold mb-3">আজকের পরিসংখ্যান</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4">
              <p className="text-xs text-[var(--muted)]">বিজ্ঞাপন দেখা</p>
              <p className="text-xl font-bold font-mono-num mt-1 text-[var(--primary)]">
                {regularTaskSettings.ad.enabled
                  ? `${toBn(account.dailyAds)}/${toBn(regularTaskSettings.ad.limit)}`
                  : 'শীঘ্রই আসছে'}
              </p>
            </div>
            <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4">
              <p className="text-xs text-[var(--muted)]">স্পিন বাকি</p>
              <p className="text-xl font-bold font-mono-num mt-1 text-[var(--gold)]">
                {toBn(spinsRemaining)}/{toBn(SPIN_LIMIT)}
              </p>
            </div>
            <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4">
              <p className="text-xs text-[var(--muted)]">সম্পন্ন টাস্ক</p>
              <p className="text-xl font-bold font-mono-num mt-1">{toBn(totalTasksDone)}</p>
            </div>
            <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4">
              <p className="text-xs text-[var(--muted)]">আজকের আয়</p>
              <p className="text-xl font-bold font-mono-num mt-1 text-[var(--emerald)]">
                ৳{fmtAmount(account.dailyTodayEarn)}
              </p>
            </div>
          </div>
        </section>

        <section className="lg:col-span-7">
          <h2 className="text-base font-bold mb-3">সাম্প্রতিক লেনদেন</h2>
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] divide-y divide-[var(--border)]">
            {transactions.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--muted)]">
                কোনো লেনদেন এখনো রেকর্ড হয়নি
              </div>
            ) : (
              transactions.slice(0, 5).map((tx) => (
                <div key={tx.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] flex items-center justify-center text-lg shrink-0">
                      {tx.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{tx.title}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {tx.dateLabel} · {tx.receiptId ? `রসিদ ${tx.receiptId.slice(0, 10)}` : 'যাচাইকৃত'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-bold font-mono-num whitespace-nowrap ${
                      tx.type === 'in' ? 'text-[var(--emerald)]' : 'text-[var(--danger)]'
                    }`}
                  >
                    {tx.type === 'in' ? '+' : '-'}৳{fmtAmount(tx.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
