import React, { useEffect, useRef, useState } from 'react';
import type { SpinRecord, UserAccount } from '../services/firestoreService';
import {
  computeSpinRotation,
  fmtAmount,
  fmtBnReward,
  SPIN_LIMIT,
  toBn,
  WHEEL_SEGMENTS,
} from '../utils/takadearLogic';

interface SpinViewProps {
  account: UserAccount;
  spins: SpinRecord[];
  onSpinComplete: (prizeIndex: number, amount: number) => Promise<void>;
  onToast: (msg: string, variant?: 'default' | 'ok' | 'err' | 'gold') => void;
}

export const SpinView: React.FC<SpinViewProps> = ({
  account,
  spins,
  onSpinComplete,
  onToast,
}) => {
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);

  const mountedRef = useRef(true);
  const spinTimerRef = useRef<number | null>(null);
  const onSpinCompleteRef = useRef(onSpinComplete);
  onSpinCompleteRef.current = onSpinComplete;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (spinTimerRef.current !== null) {
        window.clearTimeout(spinTimerRef.current);
        spinTimerRef.current = null;
      }
    };
  }, []);

  const spinsLeft = Math.max(0, SPIN_LIMIT - (account.dailySpins || 0));
  const segAngle = 360 / WHEEL_SEGMENTS.length;
  const gradientStops = WHEEL_SEGMENTS.map(
    (s, idx) => `${s.c} ${idx * segAngle}deg ${(idx + 1) * segAngle}deg`
  ).join(', ');

  const handleSpin = () => {
    if (isSpinning) return;
    if (spinsLeft <= 0) {
      onToast('আজকের স্পিন সীমা শেষ হয়ে গেছে', 'err');
      return;
    }

    setIsSpinning(true);
    const prizeIndex = Math.floor(Math.random() * WHEEL_SEGMENTS.length);
    const prizeAmount = WHEEL_SEGMENTS[prizeIndex].v;
    const nextRot = computeSpinRotation(rotation, prizeIndex);
    setRotation(nextRot);

    if (spinTimerRef.current !== null) {
      window.clearTimeout(spinTimerRef.current);
    }
    spinTimerRef.current = window.setTimeout(async () => {
      spinTimerRef.current = null;
      try {
        await onSpinCompleteRef.current(prizeIndex, prizeAmount);
      } finally {
        if (mountedRef.current) {
          setIsSpinning(false);
        }
      }
    }, 4700);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <section className="lg:col-span-6 rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-6 text-center">
        <h2 className="text-lg font-bold">লাকি স্পিন হুইল</h2>
        <p className="text-xs text-[var(--muted)] mt-1">
          আজ বাকি স্পিন: <strong className="text-[var(--gold)] font-mono-num">{toBn(spinsLeft)}</strong> / {toBn(SPIN_LIMIT)}
        </p>

        <div className="relative w-[264px] h-[264px] mx-auto my-7">
          {/* Top Pointer */}
          <div
            aria-hidden="true"
            className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-20 w-0 h-0 border-l-[14px] border-r-[14px] border-t-[24px] border-l-transparent border-r-transparent border-t-amber-400 drop-shadow-md"
          />
          {/* Rotating Wheel */}
          <div
            data-testid="spin-wheel"
            className="absolute inset-0 rounded-full border-8 border-[var(--surface-2)] shadow-xl wheel-spin-transition"
            style={{
              background: `conic-gradient(from 0deg, ${gradientStops})`,
              transform: `rotate(${rotation}deg)`,
            }}
          >
            {WHEEL_SEGMENTS.map((seg, idx) => {
              const angle = idx * segAngle + segAngle / 2;
              return (
                <span
                  key={idx}
                  className="absolute top-1/2 left-1/2 text-[11px] font-bold text-white pointer-events-none select-none font-mono-num"
                  style={{
                    width: '48px',
                    marginLeft: '-24px',
                    marginTop: '-9px',
                    textAlign: 'center',
                    transformOrigin: 'center center',
                    transform: `rotate(${angle}deg) translateY(-88px) rotate(-${angle}deg)`,
                    textShadow: '0 1px 3px rgba(0,0,0,0.65)',
                  }}
                >
                  {fmtBnReward(seg.v)}৳
                </span>
              );
            })}
          </div>
          {/* Center Hub */}
          <div
            aria-hidden="true"
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-[var(--primary)] border-4 border-[var(--surface)] shadow-lg flex items-center justify-center text-2xl z-10"
          >
            🎰
          </div>
        </div>

        <button
          type="button"
          disabled={isSpinning || spinsLeft <= 0}
          onClick={handleSpin}
          className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSpinning
            ? 'চাকা ঘুরছে...'
            : spinsLeft <= 0
              ? 'আজকের স্পিন শেষ'
              : `ফ্রি স্পিন করুন (${toBn(spinsLeft)} বাকি)`}
        </button>
      </section>

      <section className="lg:col-span-6 rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-6">
        <h3 className="text-base font-bold mb-3">সাম্প্রতিক স্পিন রেকর্ড</h3>
        {spins.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--muted)]">
            এখনো কোনো স্পিন রেকর্ড নেই
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {spins.map((s) => (
              <div key={s.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">লাকি স্পিন পুরস্কার</p>
                  <p className="text-xs text-[var(--muted)]">{s.dateLabel}</p>
                </div>
                <span className="text-sm font-bold font-mono-num text-[var(--emerald)]">
                  +৳{fmtAmount(s.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
