import { auth } from '../firebase';
import type { TelegramClientNotificationInput } from '../server/telegram';

export interface ApiHealthResponse {
  status: string;
  projectId: string;
  firestoreDatabaseId: string;
  authDomain: string;
  storageBucket: string;
  androidPackageName: string;
  androidAppId: string;
  webAppId: string;
  encryption: string;
  authVerification: string;
  timestamp: number;
}

export interface SessionVerifyResponse {
  verified: boolean;
  uid: string;
  emailMasked: string | null;
  emailVerified: boolean;
  isAdmin: boolean;
  expiresAt: number;
}

export interface EncryptResponse {
  uid: string;
  encrypted: string;
  masked: string;
  algorithm: 'AES-256-GCM';
  keyVersion: string;
}

export interface SignedReceiptResponse {
  receiptId: string;
  receiptSignature: string;
  verifiedAt: number;
}

async function getBearerHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('অথেনটিকেশন সেশন পাওয়া যায়নি');
  }
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchApiHealth(): Promise<ApiHealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) {
    throw new Error(`API health check failed (${res.status})`);
  }
  return (await res.json()) as ApiHealthResponse;
}

export async function verifyServerSession(): Promise<SessionVerifyResponse> {
  const headers = await getBearerHeaders();
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'সেশন ভেরিফিকেশন ব্যর্থ');
  }
  return (await res.json()) as SessionVerifyResponse;
}

export async function encryptFieldOnServer(
  type: 'email' | 'wallet_number' | 'phone' | 'credentials',
  value: string
): Promise<EncryptResponse> {
  const headers = await getBearerHeaders();
  const res = await fetch('/api/secure/encrypt', {
    method: 'POST',
    headers,
    body: JSON.stringify({ type, value }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'ডাটা এনক্রিপশন ব্যর্থ হয়েছে');
  }
  return (await res.json()) as EncryptResponse;
}

export async function decryptFieldOnServer(
  encrypted: string,
  ownerUid: string
): Promise<string> {
  const headers = await getBearerHeaders();
  const res = await fetch('/api/secure/decrypt', {
    method: 'POST',
    headers,
    body: JSON.stringify({ encrypted, ownerUid }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'ডিক্রিপশন অনুমোদিত নয়');
  }
  const data = (await res.json()) as { plaintext: string };
  return data.plaintext;
}

export async function decryptBatchOnServer(
  items: Array<{ id: string; encrypted: string }>
): Promise<Record<string, string | null>> {
  if (items.length === 0) return {};
  const headers = await getBearerHeaders();
  const res = await fetch('/api/admin/decrypt-batch', {
    method: 'POST',
    headers,
    body: JSON.stringify({ items }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'ব্যাচ ডিক্রিপশন অনুমোদিত নয়');
  }
  const data = (await res.json()) as { results?: Record<string, string | null> };
  return data.results || {};
}

export interface AdminSecurityStatus {
  adminEmail: string;
  projectId: string;
  databaseId: string;
  encryptionAlgorithm: string;
  signatureAlgorithm: string;
  tokenVerification: string;
  customKeyConfigured: boolean;
}

export async function fetchAdminSecurityStatus(): Promise<AdminSecurityStatus> {
  const headers = await getBearerHeaders();
  const res = await fetch('/api/admin/security-status', {
    method: 'GET',
    headers,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'অ্যাডমিন সিকিউরিটি স্ট্যাটাস লোড ব্যর্থ');
  }
  return (await res.json()) as AdminSecurityStatus;
}

export async function signRewardReceipt(params: {
  action:
    | 'signup'
    | 'referral'
    | 'referral_friend'
    | 'checkin'
    | 'task'
    | 'spin'
    | 'withdrawal'
    | 'admin_adjust'
    | 'account_submit'
    | 'account_approve';
  amount: number;
  taskId?: string;
  prizeIndex?: number;
  streakDay?: number;
  method?: string;
  platform?: 'gmail' | 'facebook';
}): Promise<SignedReceiptResponse> {
  const headers = await getBearerHeaders();
  const res = await fetch('/api/rewards/sign', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'সিকিউর রসিদ স্বাক্ষর ব্যর্থ হয়েছে');
  }
  return (await res.json()) as SignedReceiptResponse;
}

export async function notifyTelegramEvent(event: TelegramClientNotificationInput): Promise<void> {
  try {
    if (!auth.currentUser) return;
    const headers = await getBearerHeaders();
    await fetch('/api/notify/telegram', {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
      keepalive: true,
    });
  } catch {
    // Strictly non-blocking: never disrupt wallet or support UX on notification errors
  }
}
