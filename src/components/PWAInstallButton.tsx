import React, { useState } from 'react';
import { Download, Smartphone, X, CheckCircle2, Share, MoreVertical } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface Props {
  variant?: 'header' | 'banner' | 'sidebar';
  onInstalled?: () => void;
}

export const PWAInstallButton: React.FC<Props> = ({ variant = 'header', onInstalled }) => {
  const { isInstallable, canPromptDirectly, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [installing, setInstalling] = useState(false);

  // If already installed or not on supported browser, don't show intrusive UI
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (canPromptDirectly) {
      setInstalling(true);
      const success = await install();
      setInstalling(false);
      if (success && onInstalled) {
        onInstalled();
      }
    } else {
      setShowGuideModal(true);
    }
  };

  const buttonContent = (
    <>
      {variant === 'header' && (
        <button
          type="button"
          onClick={handleInstallClick}
          disabled={installing}
          className="min-h-[36px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer transition-all active:scale-95"
          title="গুগল ক্রোম থেকে অ্যাপ ইনস্টল করুন"
        >
          <Download className="w-3.5 h-3.5 shrink-0 animate-bounce" />
          <span>অ্যাপ ইনস্টল</span>
        </button>
      )}

      {variant === 'sidebar' && (
        <button
          type="button"
          onClick={handleInstallClick}
          disabled={installing}
          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>মোবাইল অ্যাপ ইনস্টল</span>
        </button>
      )}

      {variant === 'banner' && (
        <div className="rounded-2xl bg-gradient-to-r from-emerald-950/70 to-teal-950/70 border border-emerald-500/30 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-white">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="TakaDear লোগো"
              className="w-12 h-12 rounded-xl object-cover shadow-md border border-emerald-400/40 shrink-0 bg-white/10"
            />
            <div>
              <p className="text-sm font-bold flex items-center gap-1.5 text-emerald-200">
                <span>টাকাডিয়ার অ্যাপ ইনস্টল করুন</span>
              </p>
              <p className="text-xs text-slate-300">
                হোমস্ক্রিনে সহজে এক ক্লিকে ব্যবহার করুন ও দ্রুত ইনকাম করুন
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleInstallClick}
            disabled={installing}
            className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-all active:scale-95 shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>ইনস্টল করুন</span>
          </button>
        </div>
      )}
    </>
  );

  return (
    <>
      {buttonContent}

      {/* Guide Modal for browsers where direct prompt is pending or iOS Safari */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center">
              <img
                src="/logo.png"
                alt="TakaDear"
                className="w-16 h-16 rounded-2xl object-cover shadow-lg border border-[var(--border)] mb-3 bg-white/10"
              />
              <h3 className="text-lg font-bold">টাকাডিয়ার অ্যাপ ইনস্টল নির্দেশিকা</h3>
              <p className="text-xs text-[var(--muted)] mt-1">
                আপনার ডিভাইসে সরাসরি অ্যাপ হিসেবে সংরক্ষণ করুন
              </p>
            </div>

            <div className="mt-5 space-y-3 text-xs">
              {isIOS ? (
                <div className="p-3.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] space-y-2">
                  <p className="font-semibold text-[var(--text)] flex items-center gap-2">
                    <Share className="w-4 h-4 text-sky-400" />
                    <span>আইফোন / Safari ব্রাউজারে:</span>
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 text-[var(--muted)] pl-1">
                    <li>Safari ব্রাউজারের নিচে <strong>Share (শেয়ার)</strong> আইকনে চাপুন</li>
                    <li>তালিকা থেকে <strong>Add to Home Screen</strong> সিলেক্ট করুন</li>
                    <li>উপরে ডানদিকের <strong>Add</strong> বাটনে ট্যাপ করুন</li>
                  </ol>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] space-y-2">
                  <p className="font-semibold text-[var(--text)] flex items-center gap-2">
                    <MoreVertical className="w-4 h-4 text-emerald-400" />
                    <span>গুগল ক্রোম (Chrome) ব্রাউজারে:</span>
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 text-[var(--muted)] pl-1">
                    <li>উপরে ডানদিকের <strong>থ্রি-ডট মেনু (⋮)</strong> এ চাপুন</li>
                    <li>সেখান থেকে <strong>"ইনস্টল করুন" (Install TakaDear)</strong> বা <strong>"Add to Home screen"</strong> এ ট্যাপ করুন</li>
                    <li>কনফার্মেশনে <strong>Install</strong> এ ক্লিক করলেই অ্যাপ প্রস্তুত হয়ে যাবে</li>
                  </ol>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="mt-5 w-full min-h-[42px] rounded-xl bg-[var(--primary)] text-white font-bold text-xs cursor-pointer shadow-md"
            >
              ঠিক আছে
            </button>
          </div>
        </div>
      )}
    </>
  );
};
