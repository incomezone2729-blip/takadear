import React, { useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import type { UserAccount, WithdrawalRecord } from '../services/firestoreService';
import {
  calculateWithdrawalTotal,
  DEFAULT_WITHDRAWAL_SETTINGS,
  fmtAmount,
  fmtBnReward,
  formatAppErrorMessage,
  MIN_WITHDRAW,
  roundMoney,
  toBn,
  validateWithdrawal,
  type PaymentMethod,
  type WithdrawalSettingsConfig,
} from '../utils/takadearLogic';
import { BkashLogo } from './BkashLogo';
import { Modal } from './Modal';

interface WalletViewProps {
  account: UserAccount;
  withdrawals: WithdrawalRecord[];
  withdrawalSettings?: WithdrawalSettingsConfig;
  onSubmitWithdrawal: (method: PaymentMethod, accountNumber: string, amount: number) => Promise<void>;
  onToast: (msg: string, variant?: 'default' | 'ok' | 'err' | 'gold') => void;
}

export const WalletView: React.FC<WalletViewProps> = ({
  account,
  withdrawals,
  withdrawalSettings = DEFAULT_WITHDRAWAL_SETTINGS,
  onSubmitWithdrawal,
  onToast,
}) => {
  const method: PaymentMethod = 'bKash';
  const [accountNumber, setAccountNumber] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const parsedAmount = roundMoney(parseFloat(amountInput));
  const hasValidNumericAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const { payoutAmount, fee, totalDeducted } = calculateWithdrawalTotal(
    hasValidNumericAmount ? parsedAmount : 0,
    withdrawalSettings
  );

  const feeRateLabel =
    withdrawalSettings.feeValue <= 0
      ? 'ফ্রি (৳০)'
      : withdrawalSettings.feeType === 'percent'
        ? `${toBn(withdrawalSettings.feeValue)}%`
        : `৳${fmtBnReward(withdrawalSettings.feeValue)}`;

  const handleRequestClick = (e: React.FormEvent) => {
    e.preventDefault();
    const calc = calculateWithdrawalTotal(parsedAmount, withdrawalSettings);
    const err = validateWithdrawal(accountNumber, calc.payoutAmount, account.balance, calc.fee);
    if (err) {
      onToast(err, 'err');
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmitWithdrawal(method, accountNumber.trim(), payoutAmount);
      setAccountNumber('');
      setAmountInput('');
      setConfirmOpen(false);
    } catch (err) {
      onToast(formatAppErrorMessage(err, 'উত্তোলন ব্যর্থ হয়েছে'), 'err');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <div className="lg:col-span-6 space-y-5">
        <section className="rounded-3xl p-6 bg-gradient-to-br from-emerald-500 to-teal-600 text-slate-950 shadow-lg">
          <p className="text-xs font-bold opacity-80">উত্তোলনযোগ্য ব্যালেন্স</p>
          <p className="text-4xl font-bold font-mono-num mt-1">৳{fmtAmount(account.balance)}</p>
          <p className="text-xs font-medium opacity-80 mt-2">
            সর্বনিম্ন উত্তোলন: ৳{toBn(MIN_WITHDRAW)} · পেমেন্ট মাধ্যম: বিকাশ (bKash)
          </p>
        </section>

        <section className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold">বিকাশ (bKash) উত্তোলন অনুরোধ</h2>
            <span className="text-xs text-[var(--emerald)] flex items-center gap-1 font-medium">
              <Lock className="w-3.5 h-3.5" />
              <span>এনক্রিপ্টেড</span>
            </span>
          </div>

          <form onSubmit={handleRequestClick} className="space-y-4">
            <div>
              <span className="block text-xs font-medium text-[var(--muted)] mb-2">
                পেমেন্ট মাধ্যম
              </span>
              <div className="p-3.5 rounded-2xl bg-[#E2136E]/10 border border-[#E2136E]/40 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <BkashLogo className="w-10 h-10 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--text)]">বিকাশ (bKash)</p>
                    <p className="text-xs text-[var(--muted)] truncate">
                      শুধুমাত্র বিকাশ পার্সোনাল নম্বরে পেআউট
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-[#E2136E] text-white text-[11px] font-bold shrink-0">
                  সক্রিয়
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="wd-number" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                বিকাশ (bKash) অ্যাকাউন্ট নম্বর
              </label>
              <input
                id="wd-number"
                type="tel"
                inputMode="numeric"
                maxLength={11}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono-num text-[var(--text)] focus:outline-none focus:border-[#E2136E]"
              />
            </div>

            <div>
              <label htmlFor="wd-amount" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                পরিমাণ (সর্বনিম্ন ৳{toBn(MIN_WITHDRAW)})
              </label>
              <input
                id="wd-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={MIN_WITHDRAW}
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="100"
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono-num text-[var(--text)] focus:outline-none focus:border-[#E2136E]"
              />
            </div>

            <div className="p-3.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] text-xs space-y-1.5">
              <div className="flex items-center justify-between text-[var(--muted)]">
                <span>বর্তমান উইথড্র ফি হার</span>
                <span className="font-mono-num font-semibold text-[var(--text)]">{feeRateLabel}</span>
              </div>
              <div className="flex items-center justify-between text-[var(--muted)]">
                <span>বিকাশে পাবেন (উত্তোলন পরিমাণ)</span>
                <span className="font-mono-num font-semibold text-[var(--text)]">
                  ৳{fmtAmount(hasValidNumericAmount ? payoutAmount : 0)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[var(--muted)]">
                <span>উইথড্র ফি (+ যোগ হবে)</span>
                <span className="font-mono-num font-semibold text-[var(--gold)]">
                  +৳{fmtAmount(hasValidNumericAmount ? fee : 0)}
                </span>
              </div>
              <div className="pt-1.5 border-t border-[var(--border)] flex items-center justify-between font-bold text-sm">
                <span>মোট ওয়ালেট থেকে কাটবে</span>
                <span className="font-mono-num text-[var(--emerald)]">
                  ৳{fmtAmount(hasValidNumericAmount ? totalDeducted : 0)}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#E2136E] hover:bg-[#c81060] text-white font-bold text-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <BkashLogo className="w-5 h-5" />
              <span>বিকাশে উত্তোলনের অনুরোধ করুন</span>
            </button>
          </form>
        </section>
      </div>

      <section className="lg:col-span-6 rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold">উত্তোলনের ইতিহাস</h3>
          <span className="text-xs text-[var(--muted)]">নম্বর মাস্কড ও এনক্রিপ্টেড</span>
        </div>

        {withdrawals.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--muted)]">
            এখনো কোনো উত্তোলনের অনুরোধ নেই
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {withdrawals.map((w) => {
              const wdFee = Number(w.fee || 0);
              const wdTotal = Number(w.totalAmount ?? w.amount + wdFee);
              return (
                <div key={w.id} className="py-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {w.method === 'bKash' && <BkashLogo className="w-8 h-8 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {w.method} · <span className="font-mono-num">{w.maskedNumber}</span>
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {w.dateLabel} · রসিদ {w.receiptId.slice(0, 10)}
                      </p>
                      {wdFee > 0 && (
                        <p className="text-[11px] text-[var(--muted)] font-mono-num">
                          পাবেন ৳{fmtAmount(w.amount)} + ফি ৳{fmtAmount(wdFee)} = মোট ৳{fmtAmount(wdTotal)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold font-mono-num text-[var(--danger)]">
                      ৳{fmtAmount(w.amount)}
                    </p>
                    <p
                      className={`text-xs font-semibold ${
                        w.status === 'সম্পন্ন'
                          ? 'text-[var(--emerald)]'
                          : w.status === 'বাতিল'
                            ? 'text-[var(--danger)]'
                            : 'text-[var(--gold)]'
                      }`}
                    >
                      {w.status}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="বিকাশ উত্তোলন নিশ্চিত করুন"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#E2136E]/10 border border-[#E2136E]/35">
            <BkashLogo className="w-10 h-10 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text)]">বিকাশ (bKash)</p>
              <p className="text-xs font-mono-num text-[var(--muted)]">{accountNumber}</p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] text-xs space-y-1.5">
            <div className="flex items-center justify-between text-[var(--muted)]">
              <span>উত্তোলন পরিমাণ (বিকাশে পাবেন)</span>
              <span className="font-mono-num font-semibold text-[var(--text)]">
                ৳{fmtAmount(payoutAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[var(--muted)]">
              <span>বিকাশ উইথড্র ফি</span>
              <span className="font-mono-num font-semibold text-[var(--gold)]">
                +৳{fmtAmount(fee)}
              </span>
            </div>
            <div className="pt-1.5 border-t border-[var(--border)] flex items-center justify-between text-sm font-bold">
              <span>মোট ওয়ালেট কর্তন</span>
              <span className="font-mono-num text-[var(--emerald)]">
                ৳{fmtAmount(totalDeducted)}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs flex items-center gap-2 text-[var(--muted)]">
            <ShieldCheck className="w-4 h-4 text-[var(--emerald)] shrink-0" />
            <span>আপনার বিকাশ নম্বর AES-256-GCM দ্বারা এনক্রিপ্ট করে পাঠানো হবে।</span>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="flex-1 min-h-[44px] rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm font-semibold cursor-pointer"
            >
              বাতিল
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleConfirm}
              className="flex-1 min-h-[44px] rounded-xl bg-[#E2136E] hover:bg-[#c81060] text-white text-sm font-bold cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'প্রসেস হচ্ছে...' : 'নিশ্চিত করুন'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
