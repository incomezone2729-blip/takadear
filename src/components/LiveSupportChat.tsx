import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Shield, ShieldAlert } from 'lucide-react';
import {
  markSupportThreadRead,
  sendSupportMessage,
  subscribeSupportMessages,
  type SupportMessageRecord,
} from '../services/firestoreService';
import { formatAppErrorMessage, validateSupportMessageText } from '../utils/takadearLogic';

interface LiveSupportChatProps {
  threadUid: string;
  userName: string;
  userRefCode: string;
  userSuspended: boolean;
  viewerUid: string;
  viewerName: string;
  viewerRole: 'user' | 'admin';
  onToast?: (msg: string, variant?: 'default' | 'ok' | 'err' | 'gold') => void;
  compact?: boolean;
}

export const LiveSupportChat: React.FC<LiveSupportChatProps> = ({
  threadUid,
  userName,
  userRefCode,
  userSuspended,
  viewerUid,
  viewerName,
  viewerRole,
  onToast,
  compact = false,
}) => {
  const [messages, setMessages] = useState<SupportMessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const unsub = subscribeSupportMessages(
      threadUid,
      (list) => {
        setMessages(list);
        setLoading(false);
        void markSupportThreadRead(threadUid, viewerRole);
      },
      (err) => {
        setLoading(false);
        setError(formatAppErrorMessage(err, 'মেসেজ লোড করতে সমস্যা হয়েছে'));
      }
    );
    return () => unsub();
  }, [threadUid, viewerRole]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const validationErr = validateSupportMessageText(text);
    if (validationErr) {
      setError(validationErr);
      return;
    }

    const outgoing = text.trim();
    setSending(true);
    try {
      await sendSupportMessage({
        threadUid,
        userName,
        userRefCode,
        userSuspended,
        senderUid: viewerUid,
        senderName: viewerName,
        senderRole: viewerRole,
        text: outgoing,
      });
      setText('');
    } catch (err) {
      const msg = formatAppErrorMessage(err, 'মেসেজ পাঠানো যায়নি');
      setError(msg);
      if (onToast) onToast(msg, 'err');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] overflow-hidden">
      <div
        className={`overflow-y-auto p-4 space-y-3 ${
          compact ? 'h-64 sm:h-72' : 'h-80 sm:h-96'
        }`}
      >
        {loading ? (
          <div className="h-full flex items-center justify-center text-xs text-[var(--muted)]">
            লাইভ চ্যাট লোড হচ্ছে...
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <MessageCircle className="w-8 h-8 text-[var(--primary)] opacity-70 mb-2" />
            <p className="text-sm font-semibold">লাইভ সাপোর্ট</p>
            <p className="text-xs text-[var(--muted)] mt-1 max-w-xs">
              {viewerRole === 'admin'
                ? 'এই ব্যবহারকারীর সাথে এখনো কোনো কথোপকথন শুরু হয়নি। নিচে মেসেজ লিখে পাঠান।'
                : 'যেকোনো সমস্যা বা অ্যাকাউন্ট সাসপেনশন সংক্রান্ত বিষয়ে সরাসরি অ্যাডমিনকে মেসেজ করুন।'}
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const isMine = m.senderRole === viewerRole;
            return (
              <div
                key={m.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 text-[11px] text-[var(--muted)]">
                  {m.senderRole === 'admin' && (
                    <Shield className="w-3 h-3 text-[var(--gold)]" />
                  )}
                  <span className="font-semibold">
                    {m.senderRole === 'admin' ? 'অ্যাডমিন সাপোর্ট' : m.senderName}
                  </span>
                  <span>·</span>
                  <span>{m.dateLabel}</span>
                </div>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    isMine
                      ? 'bg-[var(--primary)] text-white rounded-br-sm'
                      : m.senderRole === 'admin'
                        ? 'bg-[var(--surface)] border border-amber-500/40 text-[var(--text)] rounded-bl-sm'
                        : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-bl-sm'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={listEndRef} />
      </div>

      {error && (
        <p
          role="alert"
          className="px-4 py-2 bg-rose-500/10 border-t border-rose-500/30 text-xs text-[var(--danger)] flex items-center gap-1.5"
        >
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <form
        onSubmit={handleSend}
        className="p-3 bg-[var(--surface)] border-t border-[var(--border)] flex items-center gap-2"
      >
        <input
          type="text"
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            viewerRole === 'admin'
              ? `${userName}-কে উত্তর লিখুন...`
              : 'অ্যাডমিনের কাছে আপনার মেসেজ লিখুন...'
          }
          aria-label="সাপোর্ট মেসেজ"
          className="flex-1 min-w-0 min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-sm focus:outline-none focus:border-[var(--primary)]"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--primary)] hover:opacity-95 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{sending ? 'পাঠানো হচ্ছে' : 'পাঠান'}</span>
        </button>
      </form>
    </div>
  );
};
