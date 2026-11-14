import React, { useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import type { UserAccount, WithdrawalRecord } from '../services/firestoreService';
import {
  fmtAmount,
  MIN_WITHDRAW,
  roundMoney,
  toBn,
  validateWithdrawal,
  type PaymentMethod,
} from '../utils/takadearLogic';
import { Modal } from './Modal';

interface WalletViewProps {
  account: UserAccount;
  withdrawals: WithdrawalRecord[];
  onSubmitWithdrawal: (method: PaymentMethod, accountNumber: string, amount: number) => Promise<void>;
  onToast: (msg: string, variant?: 'default' | 'ok' | 'err' | 'gold') => void;
}

const METHODS: Array<{ id: PaymentMethod; label: string; dotColor: string }> = [
  { id: 'bKash', label: 'bKash', dotColor: 'text-fuchsia-500' },
  { id: 'Nagad', label: 'Nagad', dotColor: 'text-orange-500' },
  { id: 'Rocket', label: 'Rocket', dotColor: 'text-rose-500' },
];

export const WalletView: React.FC<WalletViewProps> = ({
  account,
  withdrawals,
  onSubmitWithdrawal,
  onToast,
}) => {
  const [method, setMethod] = useState<PaymentMethod>('bKash');
  const [accountNumber, setAccountNumber] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const parsedAmount = roundMoney(parseFloat(amountInput));

  const handleRequestClick = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateWithdrawal(accountNumber, parsedAmount, account.balance);
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
      await onSubmitWithdrawal(method, accountNumber.trim(), parsedAmount);
      setAccountNumber('');
      setAmountInput('');
      setConfirmOpen(false);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'উত্তোলন ব্যর্থ হয়েছে', 'err');
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
            সর্বনিম্ন উত্তোলন: ৳{toBn(MIN_WITHDRAW)} · AES-256-GCM এনক্রিপ্টেড পেআউট
          </p>
        </section>

        <section className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold">টাকা উত্তোলনের অনুরোধ</h2>
            <span className="text-xs text-[var(--emerald)] flex items-center gap-1 font-medium">
              <Lock className="w-3.5 h-3.5" />
              <span>এনক্রিপ্টেড</span>
            </span>
          </div>

          <form onSubmit={handleRequestClick} className="space-y-4">
            <div>
              <span className="block text-xs font-medium text-[var(--muted)] mb-2">পেমেন্ট মেথড নির্বাচন করুন</span>
              <div className="grid grid-cols-3 gap-2.5">
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    className={`min-h-[52px] rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                      method === m.id
                        ? 'bg-[var(--primary-soft)] border-[var(--primary)] text-[var(--text)]'
                        : 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    <span className={m.dotColor}>●</span>
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="wd-number" className="block text-xs font-medium text-[var(--muted)] mb-1.5">
                {method} অ্যাকাউন্ট নম্বর
              </label>
              <input
                id="wd-number"
                type="tel"
                inputMode="numeric"
                maxLength={11}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono-num text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
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
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm font-mono-num text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[var(--emerald)] hover:opacity-95 text-slate-950 font-bold text-sm transition-opacity cursor-pointer disabled:opacity-50"
            >
              এনক্রিপ্ট ও উত্তোলনের অনুরোধ করুন
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
            {withdrawals.map((w) => (
              <div key={w.id} className="py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {w.method} · <span className="font-mono-num">{w.maskedNumber}</span>
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    {w.dateLabel} · রসিদ {w.receiptId.slice(0, 10)}
                  </p>
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
            ))}
          </div>
        )}
      </section>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="উত্তোলন নিশ্চিত করুন"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            আপনি <strong className="text-[var(--text)]">{method}</strong> নম্বরে{' '}
            <strong className="text-[var(--emerald)] font-mono-num">৳{fmtAmount(parsedAmount || 0)}</strong>{' '}
            উত্তোলন করতে যাচ্ছেন। অ্যাকাউন্ট নম্বরটি AES-256-GCM দ্বারা এনক্রিপ্ট করে সংরক্ষণ করা হবে।
          </p>
          <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs flex items-center gap-2 text-[var(--muted)]">
            <ShieldCheck className="w-4 h-4 text-[var(--emerald)] shrink-0" />
            <span className="font-mono-num">{method} · {accountNumber}</span>
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
              className="flex-1 min-h-[44px] rounded-xl bg-[var(--emerald)] text-slate-950 text-sm font-bold cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'প্রসেস হচ্ছে...' : 'নিশ্চিত করুন'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
