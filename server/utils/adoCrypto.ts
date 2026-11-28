import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export interface EncryptedAdoSecretPayload {
  v: 1;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

export class AdoCryptoError extends Error {
  readonly code = 'ADO_SERVER_MISCONFIGURED' as const;

  constructor(message: string) {
    super(message);
    this.name = 'AdoCryptoError';
  }
}

const DEV_FALLBACK_SECRET = 'klox-local-dev-only-ado-key-do-not-use-in-prod';
const HKDF_INFO = Buffer.from('klox-ado-pat-v1', 'utf8');
let warnedDevKey = false;

function resolveMasterSecret(masterSecret: string | undefined, isDev: boolean): string {
  const trimmed = (masterSecret ?? '').trim();
  if (trimmed.length >= 16) return trimmed;
  if (isDev) {
    if (!warnedDevKey) {
      warnedDevKey = true;
      console.warn(
        '[Klox ADO Vault] Using ephemeral local dev encryption fallback. Set NUXT_ADO_ENCRYPTION_KEY in production.'
      );
    }
    return DEV_FALLBACK_SECRET;
  }
  throw new AdoCryptoError('ADO_SERVER_MISCONFIGURED');
}

function deriveKey(masterSecret: string, salt: Buffer): Buffer {
  const raw = hkdfSync('sha256', Buffer.from(masterSecret, 'utf8'), salt, HKDF_INFO, 32);
  return Buffer.from(raw);
}

export function encryptAdoSecret(params: {
  plaintext: string;
  uid: string;
  masterSecret?: string;
  isDev?: boolean;
}): EncryptedAdoSecretPayload {
  const secret = resolveMasterSecret(params.masterSecret, Boolean(params.isDev));
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(secret, salt);

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(params.uid, 'utf8'));

  const encrypted = Buffer.concat([
    cipher.update(params.plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    v: 1,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };
}

export function decryptAdoSecret(params: {
  payload: EncryptedAdoSecretPayload;
  uid: string;
  masterSecret?: string;
  isDev?: boolean;
}): string {
  const secret = resolveMasterSecret(params.masterSecret, Boolean(params.isDev));
  const salt = Buffer.from(params.payload.salt, 'base64');
  const iv = Buffer.from(params.payload.iv, 'base64');
  const tag = Buffer.from(params.payload.tag, 'base64');
  const ciphertext = Buffer.from(params.payload.ciphertext, 'base64');
  const key = deriveKey(secret, salt);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(params.uid, 'utf8'));
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

export function encryptAdoTokenMap(params: {
  tokens: Record<string, string>;
  uid: string;
  masterSecret?: string;
  isDev?: boolean;
}): EncryptedAdoSecretPayload {
  const cleanTokens: Record<string, string> = {};
  for (const [id, pat] of Object.entries(params.tokens)) {
    const cleanId = id.trim();
    const cleanPat = pat.trim();
    if (cleanId && cleanPat) {
      cleanTokens[cleanId] = cleanPat;
    }
  }
  return encryptAdoSecret({
    plaintext: JSON.stringify({ v: 2, tokens: cleanTokens }),
    uid: params.uid,
    masterSecret: params.masterSecret,
    isDev: params.isDev,
  });
}

export function decryptAdoTokenMap(params: {
  payload: EncryptedAdoSecretPayload;
  uid: string;
  masterSecret?: string;
  isDev?: boolean;
}): Record<string, string> {
  const plaintext = decryptAdoSecret(params);
  try {
    const parsed = JSON.parse(plaintext) as { v?: unknown; tokens?: unknown };
    if (parsed && parsed.v === 2 && parsed.tokens && typeof parsed.tokens === 'object') {
      const result: Record<string, string> = {};
      for (const [key, val] of Object.entries(parsed.tokens as Record<string, unknown>)) {
        if (typeof val === 'string' && val.trim()) {
          result[key] = val;
        }
      }
      return result;
    }
  } catch {
    // Legacy v1 single-string PAT fallback
  }
  return plaintext.trim() ? { legacy_default: plaintext.trim() } : {};
}
