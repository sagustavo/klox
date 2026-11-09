import type { EntityId } from './types';

export interface IdGenerator {
  next(): EntityId;
}

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Generates a Firestore-style 20-character random alphanumeric ID using Web Crypto.
 * Uniformly distributed across lexicographical key ranges (avoids write hotspots — ADR-0003).
 */
export function generateRandomId(): EntityId {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export const defaultIdGenerator: IdGenerator = {
  next: () => generateRandomId(),
};

export interface DeterministicLogKey {
  startTimeUTC: string;
  durationSeconds: number;
  normalizedDescription: string;
  projectName: string;
}

/**
 * Computes a deterministic 22-char base62 ID from a SHA-256 hash of a Toggl log row.
 * Re-importing the same CSV overwrites idempotently without creating duplicates (ADR-0003).
 */
export async function deterministicLogId(key: DeterministicLogKey): Promise<EntityId> {
  const payload = `${key.startTimeUTC}|${key.durationSeconds}|${key.normalizedDescription}|${key.projectName.trim().toLowerCase()}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  const bytes = new Uint8Array(digest);
  let out = '';
  for (let i = 0; i < 22; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}
