export interface JsonResponseLike {
  ok: boolean;
  status: number;
  statusText?: string;
  headers?: { get(name: string): string | null };
  text(): Promise<string>;
}

export function resolveApiUrl(path: string, baseUrlOverride?: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const envBase =
    baseUrlOverride ??
    (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL) ??
    '';
  const trimmedBase = String(envBase || '').trim().replace(/\/+$/, '');
  if (!trimmedBase) {
    return normalizedPath;
  }
  return `${trimmedBase}${normalizedPath}`;
}

export async function safeParseJsonResponse<T>(
  res: JsonResponseLike,
  fallbackError: string
): Promise<T> {
  let rawText = '';
  try {
    rawText = await res.text();
  } catch {
    throw new Error(`${fallbackError} (HTTP ${res.status})`);
  }

  const trimmed = rawText.trim();
  const contentType = res.headers?.get('content-type')?.toLowerCase() || '';

  if (!trimmed) {
    throw new Error(`সার্ভার থেকে খালি উত্তর এসেছে (HTTP ${res.status}) — অনুগ্রহ করে পুনরায় চেষ্টা করুন`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const looksHtml =
      trimmed.startsWith('<!') ||
      trimmed.toLowerCase().startsWith('<html') ||
      contentType.includes('text/html');
    if (looksHtml) {
      throw new Error(
        `সার্ভার API সঠিক JSON উত্তর দেয়নি (HTTP ${res.status}) — ব্যাকএন্ড সার্ভার চালু আছে কিনা যাচাই করুন`
      );
    }
    throw new Error(`সার্ভার থেকে অসম্পূর্ণ বা অবৈধ তথ্য এসেছে (HTTP ${res.status})`);
  }

  if (!res.ok) {
    const errRecord =
      parsed && typeof parsed === 'object' ? (parsed as { error?: unknown; message?: unknown }) : {};
    const serverMsg =
      typeof errRecord.error === 'string' && errRecord.error.trim()
        ? errRecord.error.trim()
        : typeof errRecord.message === 'string' && errRecord.message.trim()
          ? errRecord.message.trim()
          : '';
    throw new Error(serverMsg || `${fallbackError} (HTTP ${res.status})`);
  }

  if (parsed === null || typeof parsed !== 'object') {
    throw new Error(`সার্ভারের তথ্যের ধরন সঠিক নয় (HTTP ${res.status})`);
  }

  return parsed as T;
}
