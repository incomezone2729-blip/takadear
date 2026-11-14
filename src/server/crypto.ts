import crypto from 'node:crypto';

export interface EncryptedPayload {
  packed: string;
  algorithm: 'AES-256-GCM';
  keyVersion: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

export interface SignedReceipt {
  receiptId: string;
  receiptSignature: string;
  verifiedAt: number;
}

const KEY_VERSION = 'v1';

function getEncryptionKey(): Buffer {
  const raw =
    process.env.ENCRYPTION_SECRET ||
    process.env.API_SIGNING_SECRET ||
    'takadear-1e124-aes256-gcm-master-fallback-key';
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

function getSigningKey(): Buffer {
  const raw =
    process.env.API_SIGNING_SECRET ||
    process.env.ENCRYPTION_SECRET ||
    'takadear-1e124-hmac-sha256-signing-fallback-key';
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptSensitiveData(plaintext: string): EncryptedPayload {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const ivB64 = iv.toString('base64url');
  const tagB64 = tag.toString('base64url');
  const cipherB64 = encrypted.toString('base64url');

  return {
    packed: `${KEY_VERSION}.${ivB64}.${tagB64}.${cipherB64}`,
    algorithm: 'AES-256-GCM',
    keyVersion: KEY_VERSION,
    iv: ivB64,
    tag: tagB64,
    ciphertext: cipherB64,
  };
}

export function decryptSensitiveData(packed: string): string {
  const parts = packed.split('.');
  if (parts.length !== 4 || parts[0] !== KEY_VERSION) {
    throw new Error('Invalid encrypted payload format');
  }
  const [, ivB64, tagB64, cipherB64] = parts;
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const ciphertext = Buffer.from(cipherB64, 'base64url');

  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error('Invalid AES-256-GCM authentication envelope');
  }

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

function canonicalize(input: Record<string, unknown>): string {
  const sortedKeys = Object.keys(input).sort();
  const ordered: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    ordered[k] = input[k];
  }
  return JSON.stringify(ordered);
}

export function signTransactionPayload(payload: Record<string, unknown>): SignedReceipt {
  const receiptId = `rcpt_${crypto.randomBytes(8).toString('hex')}`;
  const verifiedAt = Date.now();
  const message = canonicalize({ ...payload, receiptId, verifiedAt });
  const hmac = crypto.createHmac('sha256', getSigningKey()).update(message).digest('hex');

  return {
    receiptId,
    receiptSignature: hmac,
    verifiedAt,
  };
}

export function verifyTransactionSignature(
  payload: Record<string, unknown>,
  receiptId: string,
  verifiedAt: number,
  signature: string
): boolean {
  const message = canonicalize({ ...payload, receiptId, verifiedAt });
  const expected = crypto.createHmac('sha256', getSigningKey()).update(message).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
