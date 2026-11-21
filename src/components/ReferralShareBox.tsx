import React from 'react';
import { Copy, Link2, Share2 } from 'lucide-react';
import {
  buildReferralLink,
  buildReferralShareMessage,
  PUBLIC_APP_ORIGIN,
} from '../utils/takadearLogic';

interface ReferralShareBoxProps {
  refCode: string;
  referrerBonus: number;
  friendBonus: number;
  referralDomain?: string;
  onToast: (msg: string, variant?: 'default' | 'ok' | 'err' | 'gold') => void;
}

async function copyTextSafe(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to execCommand fallback
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export const ReferralShareBox: React.FC<ReferralShareBoxProps> = ({
  refCode,
  referrerBonus,
  friendBonus,
  referralDomain,
  onToast,
}) => {
  const referralLink = buildReferralLink(refCode, referralDomain, PUBLIC_APP_ORIGIN);

  const handleCopyCode = async () => {
    const ok = await copyTextSafe(refCode);
    onToast(ok ? 'রেফারেল কোড কপি হয়েছে' : 'কপি করা যায়নি', ok ? 'ok' : 'err');
  };

  const handleCopyLink = async () => {
    const ok = await copyTextSafe(referralLink);
    onToast(ok ? 'রেফারেল লিংক কপি হয়েছে' : 'লিংক কপি করা যায়নি', ok ? 'ok' : 'err');
  };

  const handleShareLink = async () => {
    const shareText = buildReferralShareMessage(
      refCode,
      referrerBonus,
      friendBonus,
      referralDomain
    );
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'টাকাডিয়ার (TakaDear) রেফারেল আমন্ত্রণ',
          text: shareText,
          url: referralLink,
        });
        return;
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') {
          return;
        }
      }
    }

    const ok = await copyTextSafe(referralLink);
    onToast(
      ok ? 'রেফারেল লিংক শেয়ারের জন্য কপি হয়েছে' : 'লিংক শেয়ার বা কপি করা যায়নি',
      ok ? 'ok' : 'err'
    );
  };

  return (
    <div className="space-y-3">
      {/* Referral Code Row */}
      <div>
        <p className="text-xs text-[var(--muted)] mb-1.5">আপনার রেফারেল কোড</p>
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-[var(--surface-2)] border border-dashed border-[var(--primary)]/50">
          <code
            data-testid="referral-code-value"
            className="text-base sm:text-lg font-bold font-mono-num tracking-widest text-[var(--primary)] select-all"
          >
            {refCode}
          </code>
          <button
            type="button"
            onClick={() => void handleCopyCode()}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] text-[var(--text)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>কোড কপি</span>
          </button>
        </div>
      </div>

      {/* Share & Copy Link Actions + Full Visible Referral Link */}
      <div className="p-3.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[var(--text)] flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-[var(--primary)] shrink-0" />
            <span>আপনার রেফারেল লিংক</span>
          </span>
        </div>

        <p
          data-testid="referral-link-value"
          className="px-3 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs font-mono-num text-[var(--text)] break-all select-all leading-relaxed"
        >
          {referralLink}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => void handleShareLink()}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--primary)] hover:opacity-95 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-opacity"
          >
            <Share2 className="w-3.5 h-3.5 shrink-0" />
            <span>লিংক শেয়ার করুন</span>
          </button>
          <button
            type="button"
            onClick={() => void handleCopyLink()}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] text-[var(--text)] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Copy className="w-3.5 h-3.5 shrink-0" />
            <span>লিংক কপি করুন</span>
          </button>
        </div>
      </div>
    </div>
  );
};
