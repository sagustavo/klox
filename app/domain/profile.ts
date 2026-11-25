import type { UserProfile } from './types';

export const DISPLAY_NAME_MAX_LENGTH = 80;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;
export const USERNAME_REGEX = /^[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$/;
export const USERNAME_CONSECUTIVE_SEP_REGEX = /[-_]{2}/;

export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin',
  'administrator',
  'api',
  'app',
  'auth',
  'billing',
  'catalog',
  'dashboard',
  'demo',
  'help',
  'import',
  'klox',
  'login',
  'logout',
  'onboarding',
  'owner',
  'pricing',
  'profile',
  'root',
  'settings',
  'signin',
  'signup',
  'support',
  'system',
  'team',
  'tracker',
  'user',
  'users',
  'welcome',
]);

export const AVATAR_DIMENSION_PX = 256;
export const AVATAR_MAX_RAW_BYTES = 5 * 1024 * 1024;
export const AVATAR_MAX_DATA_URL_LENGTH = 120_000;
export const AVATAR_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;
export const AVATAR_DATA_URL_REGEX = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+=*$/;

export type DisplayNameErrorCode = 'DISPLAY_NAME_EMPTY' | 'DISPLAY_NAME_TOO_LONG';

export type UsernameErrorCode =
  | 'USERNAME_TOO_SHORT'
  | 'USERNAME_TOO_LONG'
  | 'USERNAME_INVALID_CHARS'
  | 'USERNAME_CONSECUTIVE_SEPARATORS'
  | 'USERNAME_RESERVED';

export type AvatarFileErrorCode = 'AVATAR_UNSUPPORTED_TYPE' | 'AVATAR_FILE_TOO_LARGE';

export function normalizeDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function validateDisplayName(raw: string): {
  valid: boolean;
  normalized: string;
  error?: DisplayNameErrorCode;
} {
  const normalized = normalizeDisplayName(raw);
  if (!normalized) {
    return { valid: false, normalized, error: 'DISPLAY_NAME_EMPTY' };
  }
  if (normalized.length > DISPLAY_NAME_MAX_LENGTH) {
    return { valid: false, normalized, error: 'DISPLAY_NAME_TOO_LONG' };
  }
  return { valid: true, normalized };
}

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

export function validateUsername(
  raw: string,
  options?: { allowEmpty?: boolean }
): {
  valid: boolean;
  normalized: string;
  error?: UsernameErrorCode;
} {
  const normalized = normalizeUsername(raw);
  if (!normalized) {
    if (options?.allowEmpty) {
      return { valid: true, normalized: '' };
    }
    return { valid: false, normalized, error: 'USERNAME_TOO_SHORT' };
  }

  if (normalized.length < USERNAME_MIN_LENGTH) {
    return { valid: false, normalized, error: 'USERNAME_TOO_SHORT' };
  }
  if (normalized.length > USERNAME_MAX_LENGTH) {
    return { valid: false, normalized, error: 'USERNAME_TOO_LONG' };
  }
  if (!USERNAME_REGEX.test(normalized)) {
    return { valid: false, normalized, error: 'USERNAME_INVALID_CHARS' };
  }
  if (USERNAME_CONSECUTIVE_SEP_REGEX.test(normalized)) {
    return { valid: false, normalized, error: 'USERNAME_CONSECUTIVE_SEPARATORS' };
  }
  if (RESERVED_USERNAMES.has(normalized)) {
    return { valid: false, normalized, error: 'USERNAME_RESERVED' };
  }

  return { valid: true, normalized };
}

/**
 * Resolves the effective avatar URL:
 * User-uploaded custom avatar takes precedence over Google OAuth photoURL (FR-6.6 AC #3).
 */
export function resolveEffectiveAvatarUrl(
  profile: Pick<UserProfile, 'customAvatarUrl' | 'googlePhotoUrl'> | null | undefined
): string | null {
  if (!profile) return null;
  const custom = profile.customAvatarUrl?.trim();
  if (custom) return custom;
  const google = profile.googlePhotoUrl?.trim();
  return google || null;
}

export function getUserInitials(displayName?: string | null, email?: string | null): string {
  const cleanName = normalizeDisplayName(displayName ?? '');
  if (cleanName) {
    const parts = cleanName.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0]!.charAt(0);
      const last = parts[parts.length - 1]!.charAt(0);
      return `${first}${last}`.toUpperCase();
    }
    if (parts[0]) {
      return parts[0].charAt(0).toUpperCase();
    }
  }

  const emailLocal = (email ?? '').trim().split('@')[0];
  if (emailLocal) {
    return emailLocal.charAt(0).toUpperCase();
  }

  return 'K';
}

export function validateAvatarFileMeta(file: {
  type: string;
  size: number;
}): { valid: boolean; error?: AvatarFileErrorCode } {
  const normalizedType = file.type.trim().toLowerCase();
  if (!AVATAR_ALLOWED_MIME_TYPES.includes(normalizedType as (typeof AVATAR_ALLOWED_MIME_TYPES)[number])) {
    return { valid: false, error: 'AVATAR_UNSUPPORTED_TYPE' };
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > AVATAR_MAX_RAW_BYTES) {
    return { valid: false, error: 'AVATAR_FILE_TOO_LARGE' };
  }
  return { valid: true };
}

export function isValidAvatarDataUrl(url: string | null | undefined): boolean {
  if (typeof url !== 'string' || !url) return false;
  if (url.length > AVATAR_MAX_DATA_URL_LENGTH) return false;
  return AVATAR_DATA_URL_REGEX.test(url);
}
