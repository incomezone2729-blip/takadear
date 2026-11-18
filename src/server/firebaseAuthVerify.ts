import crypto from 'node:crypto';

export interface VerifiedFirebaseToken {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  issuer: string;
  audience: string;
  expiresAt: number;
}

interface CertCache {
  certs: Record<string, string>;
  expiresAt: number;
}

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let certCache: CertCache | null = null;
let googleClockOffsetMs = 0;

export const TOKEN_CLOCK_LEEWAY_SEC = 60;

export function parseHttpDateMs(dateHeader: string | null | undefined): number | null {
  if (!dateHeader) return null;
  const parsed = Date.parse(dateHeader);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getCalibratedNowSec(
  localNowMs: number = Date.now(),
  offsetMs: number = googleClockOffsetMs
): number {
  return Math.floor((localNowMs + offsetMs) / 1000);
}

async function fetchGoogleCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certCache && certCache.expiresAt > now) {
    return certCache.certs;
  }

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase public keys: HTTP ${res.status}`);
  }
  const serverDateMs = parseHttpDateMs(res.headers.get('date'));
  if (serverDateMs !== null) {
    googleClockOffsetMs = serverDateMs - Date.now();
  }
  const certs = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;

  certCache = {
    certs,
    expiresAt: now + maxAgeSec * 1000,
  };
  return certs;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const json = Buffer.from(segment, 'base64url').toString('utf8');
  return JSON.parse(json) as T;
}

export interface DecodedFirebaseJwtPayload {
  iss?: string;
  aud?: string;
  sub?: string;
  exp?: number;
  iat?: number;
  auth_time?: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

export function validateDecodedFirebaseClaims(
  payload: DecodedFirebaseJwtPayload,
  expectedProjectId: string,
  calibratedNowSec: number = getCalibratedNowSec()
): void {
  const expectedIssuer = `https://securetoken.google.com/${expectedProjectId}`;

  if (payload.iss !== expectedIssuer) {
    throw new Error('Invalid token issuer');
  }
  if (payload.aud !== expectedProjectId) {
    throw new Error('Invalid token audience');
  }
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new Error('Invalid token subject');
  }
  if (!payload.exp || payload.exp <= calibratedNowSec - TOKEN_CLOCK_LEEWAY_SEC) {
    throw new Error('Token expired');
  }
  if (!payload.iat || payload.iat > calibratedNowSec + 300) {
    throw new Error('Invalid token issued-at time');
  }
}

export async function verifyFirebaseIdToken(
  idToken: string,
  expectedProjectId: string
): Promise<VerifiedFirebaseToken> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed JWT token');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(headerB64);
  const payload = decodeBase64UrlJson<DecodedFirebaseJwtPayload>(payloadB64);

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported JWT header');
  }

  // Ensure Google public certs (and authoritative UTC Date header offset) are loaded before checking claims
  const certs = await fetchGoogleCerts();
  validateDecodedFirebaseClaims(payload, expectedProjectId, getCalibratedNowSec());

  const certPem = certs[header.kid];
  if (!certPem) {
    // Force refresh once in case of key rotation
    certCache = null;
    const refreshed = await fetchGoogleCerts();
    const retryPem = refreshed[header.kid];
    if (!retryPem) {
      throw new Error('Unknown signing key ID');
    }
    return verifySignatureAndBuild(retryPem, headerB64, payloadB64, signatureB64, payload);
  }

  return verifySignatureAndBuild(certPem, headerB64, payloadB64, signatureB64, payload);
}

function verifySignatureAndBuild(
  certPem: string,
  headerB64: string,
  payloadB64: string,
  signatureB64: string,
  payload: DecodedFirebaseJwtPayload
): VerifiedFirebaseToken {
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const signature = Buffer.from(signatureB64, 'base64url');
  const isValid = verifier.verify(certPem, signature);
  if (!isValid) {
    throw new Error('Invalid Firebase token signature');
  }

  return {
    uid: payload.sub!,
    email: payload.email ?? null,
    emailVerified: Boolean(payload.email_verified),
    name: payload.name ?? null,
    issuer: payload.iss!,
    audience: payload.aud!,
    expiresAt: payload.exp!,
  };
}
