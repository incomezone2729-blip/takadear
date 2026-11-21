import { auth } from '../firebase';
import type { TelegramClientNotificationInput } from '../server/telegram';
import {
  resolveApiUrl,
  safeParseJsonResponse,
} from '../utils/apiResponse';

export interface ApiHealthResponse {
  status: string;
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

const TRANSIENT_GATEWAY_STATUSES = new Set([502, 503, 504]);

async function getBearerHeaders(forceRefresh = false): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('অথেনটিকেশন সেশন পাওয়া যায়নি');
  }
  const token = await user.getIdToken(forceRefresh);
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function fetchWithFreshAuth(url: string, init: Omit<RequestInit, 'headers'>): Promise<Response> {
  const targetUrl = resolveApiUrl(url);
  const executeFetch = async (forceRefresh: boolean) => {
    const headers = await getBearerHeaders(forceRefresh);
    return fetch(targetUrl, { ...init, headers });
  };

  let res = await executeFetch(false);
  if (TRANSIENT_GATEWAY_STATUSES.has(res.status)) {
    await new Promise((resolve) => setTimeout(resolve, 650));
    res = await executeFetch(false);
  }
  if (res.status === 401 && auth.currentUser) {
    res = await executeFetch(true);
  }
  return res;
}

async function fetchPublicJson<T>(url: string, fallbackError: string): Promise<T> {
  const targetUrl = resolveApiUrl(url);
  let res = await fetch(targetUrl, {
    headers: { Accept: 'application/json' },
  });
  if (TRANSIENT_GATEWAY_STATUSES.has(res.status)) {
    await new Promise((resolve) => setTimeout(resolve, 650));
    res = await fetch(targetUrl, {
      headers: { Accept: 'application/json' },
    });
  }
  return safeParseJsonResponse<T>(res, fallbackError);
}

async function fetchAuthedJson<T>(
  url: string,
  init: Omit<RequestInit, 'headers'>,
  fallbackError: string
): Promise<T> {
  const res = await fetchWithFreshAuth(url, init);
  return safeParseJsonResponse<T>(res, fallbackError);
}

export async function fetchApiHealth(): Promise<ApiHealthResponse> {
  return fetchPublicJson<ApiHealthResponse>('/api/health', 'API হেলথ চেক ব্যর্থ হয়েছে');
}

export async function verifyServerSession(): Promise<SessionVerifyResponse> {
  return fetchAuthedJson<SessionVerifyResponse>(
    '/api/auth/session',
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    'সেশন ভেরিফিকেশন ব্যর্থ হয়েছে'
  );
}

export async function encryptFieldOnServer(
  type: 'email' | 'wallet_number' | 'phone' | 'credentials',
  value: string
): Promise<EncryptResponse> {
  return fetchAuthedJson<EncryptResponse>(
    '/api/secure/encrypt',
    {
      method: 'POST',
      body: JSON.stringify({ type, value }),
    },
    'ডাটা এনক্রিপশন ব্যর্থ হয়েছে'
  );
}

export async function decryptFieldOnServer(
  encrypted: string,
  ownerUid: string
): Promise<string> {
  const data = await fetchAuthedJson<{ plaintext?: unknown }>(
    '/api/secure/decrypt',
    {
      method: 'POST',
      body: JSON.stringify({ encrypted, ownerUid }),
    },
    'ডিক্রিপশন অনুমোদিত নয়'
  );
  if (typeof data.plaintext !== 'string') {
    throw new Error('ডিক্রিপ্টেড ডাটা পাওয়া যায়নি');
  }
  return data.plaintext;
}

export async function decryptBatchOnServer(
  items: Array<{ id: string; encrypted: string }>
): Promise<Record<string, string | null>> {
  if (items.length === 0) return {};
  const data = await fetchAuthedJson<{ results?: Record<string, string | null> }>(
    '/api/admin/decrypt-batch',
    {
      method: 'POST',
      body: JSON.stringify({ items }),
    },
    'ব্যাচ ডিক্রিপশন অনুমোদিত নয়'
  );
  return data.results && typeof data.results === 'object' ? data.results : {};
}

export interface AdminSecurityStatus {
  adminEmail: string;
  projectId: string;
  databaseId: string;
  encryptionAlgorithm: string;
  signatureAlgorithm: string;
  tokenVerification: string;
  customKeyConfigured: boolean;
  telegramConfigured?: boolean;
}

export async function fetchAdminSecurityStatus(): Promise<AdminSecurityStatus> {
  return fetchAuthedJson<AdminSecurityStatus>(
    '/api/admin/security-status',
    { method: 'GET' },
    'অ্যাডমিন সিকিউরিটি স্ট্যাটাস লোড ব্যর্থ হয়েছে'
  );
}

export async function signRewardReceipt(params: {
  action:
    | 'referral'
    | 'referral_friend'
    | 'checkin'
    | 'withdrawal'
    | 'admin_adjust'
    | 'account_submit'
    | 'account_approve';
  amount: number;
  streakDay?: number;
  method?: string;
  platform?: 'gmail' | 'facebook';
}): Promise<SignedReceiptResponse> {
  return fetchAuthedJson<SignedReceiptResponse>(
    '/api/rewards/sign',
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
    'সিকিউর রসিদ স্বাক্ষর ব্যর্থ হয়েছে'
  );
}

export async function notifyTelegramEvent(event: TelegramClientNotificationInput): Promise<void> {
  try {
    if (!auth.currentUser) return;
    const headers = await getBearerHeaders(false);
    await fetch(resolveApiUrl('/api/notify/telegram'), {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
      keepalive: true,
    });
  } catch {
    // Strictly non-blocking: never disrupt wallet or support UX on notification errors
  }
}
