import React from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

export type ToastVariant = 'default' | 'ok' | 'err' | 'gold';

interface ToastProps {
  message: string | null;
  variant?: ToastVariant;
}

export const Toast: React.FC<ToastProps> = ({ message, variant = 'default' }) => {
  if (!message) return null;

  const borderClass =
    variant === 'ok'
      ? 'border-emerald-500/50 text-emerald-700 dark:text-emerald-300'
      : variant === 'err'
        ? 'border-rose-500/50 text-rose-700 dark:text-rose-300'
        : variant === 'gold'
          ? 'border-amber-500/50 text-amber-700 dark:text-amber-300'
          : 'border-[var(--border)] text-[var(--text)]';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-20 lg:bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[var(--surface)] border shadow-lg text-sm font-medium max-w-[92vw] transition-all duration-200 ${borderClass}`}
    >
      {variant === 'ok' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
      {variant === 'err' && <AlertCircle className="w-4 h-4 shrink-0" />}
      {(variant === 'default' || variant === 'gold') && <Info className="w-4 h-4 shrink-0" />}
      <span className="truncate">{message}</span>
    </div>
  );
};
