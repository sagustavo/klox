export type LinkableAuthProviderId = 'google.com' | 'password';

export const MIN_PASSWORD_LENGTH = 6;

export type AuthErrorCode =
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_EMAIL_IN_USE'
  | 'AUTH_WEAK_PASSWORD'
  | 'AUTH_POPUP_CLOSED'
  | 'AUTH_POPUP_BLOCKED'
  | 'AUTH_UNAUTHORIZED_DOMAIN'
  | 'AUTH_PROVIDER_DISABLED'
  | 'AUTH_ACCOUNT_EXISTS_DIFFERENT_CREDENTIAL'
  | 'AUTH_CREDENTIAL_ALREADY_IN_USE'
  | 'AUTH_PROVIDER_ALREADY_LINKED'
  | 'AUTH_REQUIRES_RECENT_LOGIN'
  | 'AUTH_EMAIL_MISMATCH'
  | 'AUTH_PASSWORD_TOO_SHORT'
  | 'AUTH_PASSWORD_MISMATCH'
  | 'AUTH_CANNOT_UNLINK_LAST_PROVIDER'
  | 'AUTH_NO_EMAIL_FOR_PASSWORD_LINK'
  | 'AUTH_INVALID_EMAIL'
  | 'AUTH_TOO_MANY_REQUESTS'
  | 'AUTH_EXPIRED_ACTION_CODE'
  | 'AUTH_INVALID_ACTION_CODE'
  | 'AUTH_NETWORK_ERROR'
  | 'AUTH_GENERIC_ERROR';

export interface AuthProviderStatus {
  hasGoogle: boolean;
  hasPassword: boolean;
  connectedCount: number;
  canUnlinkGoogle: boolean;
  canUnlinkPassword: boolean;
}

/** Maps Firebase Authentication errors cleanly to localized client error codes. */
export function mapFirebaseAuthErrorCode(err: unknown): AuthErrorCode {
  const code = (err as { code?: string })?.code || '';
  if (
    code.includes('invalid-credential') ||
    code.includes('wrong-password') ||
    code.includes('user-not-found')
  ) {
    return 'AUTH_INVALID_CREDENTIALS';
  }
  if (code.includes('email-already-in-use')) {
    return 'AUTH_EMAIL_IN_USE';
  }
  if (code.includes('weak-password')) {
    return 'AUTH_WEAK_PASSWORD';
  }
  if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) {
    return 'AUTH_POPUP_CLOSED';
  }
  if (code.includes('popup-blocked')) {
    return 'AUTH_POPUP_BLOCKED';
  }
  if (code.includes('unauthorized-domain')) {
    return 'AUTH_UNAUTHORIZED_DOMAIN';
  }
  if (code.includes('operation-not-allowed')) {
    return 'AUTH_PROVIDER_DISABLED';
  }
  if (code.includes('account-exists-with-different-credential')) {
    return 'AUTH_ACCOUNT_EXISTS_DIFFERENT_CREDENTIAL';
  }
  if (code.includes('credential-already-in-use')) {
    return 'AUTH_CREDENTIAL_ALREADY_IN_USE';
  }
  if (code.includes('provider-already-linked')) {
    return 'AUTH_PROVIDER_ALREADY_LINKED';
  }
  if (code.includes('requires-recent-login')) {
    return 'AUTH_REQUIRES_RECENT_LOGIN';
  }
  if (code.includes('invalid-email')) {
    return 'AUTH_INVALID_EMAIL';
  }
  if (code.includes('too-many-requests')) {
    return 'AUTH_TOO_MANY_REQUESTS';
  }
  if (code.includes('expired-action-code')) {
    return 'AUTH_EXPIRED_ACTION_CODE';
  }
  if (code.includes('invalid-action-code')) {
    return 'AUTH_INVALID_ACTION_CODE';
  }
  if (code.includes('network-request-failed')) {
    return 'AUTH_NETWORK_ERROR';
  }
  return 'AUTH_GENERIC_ERROR';
}

export function extractAuthProviderStatus(providers: readonly string[]): AuthProviderStatus {
  const set = new Set(providers);
  const hasGoogle = set.has('google.com');
  const hasPassword = set.has('password');
  const connectedCount = (hasGoogle ? 1 : 0) + (hasPassword ? 1 : 0);

  return {
    hasGoogle,
    hasPassword,
    connectedCount,
    canUnlinkGoogle: hasGoogle && connectedCount >= 2,
    canUnlinkPassword: hasPassword && connectedCount >= 2,
  };
}

export function canUnlinkProvider(
  providers: readonly string[],
  target: LinkableAuthProviderId
): boolean {
  const status = extractAuthProviderStatus(providers);
  if (target === 'google.com') return status.canUnlinkGoogle;
  if (target === 'password') return status.canUnlinkPassword;
  return false;
}

export function validateLinkPassword(
  password: string,
  confirmPassword: string
): {
  valid: boolean;
  error?: 'AUTH_PASSWORD_TOO_SHORT' | 'AUTH_PASSWORD_MISMATCH';
} {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, error: 'AUTH_PASSWORD_TOO_SHORT' };
  }
  if (password !== confirmPassword) {
    return { valid: false, error: 'AUTH_PASSWORD_MISMATCH' };
  }
  return { valid: true };
}

export function doEmailsMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const normA = (a ?? '').trim().toLowerCase();
  const normB = (b ?? '').trim().toLowerCase();
  if (!normA || !normB) return false;
  return normA === normB;
}

/** Scopes a browser storage key to the active user/demo uid to prevent cross-account cache bleed. */
export function tenantStorageKey(baseKey: string, uid: string): string {
  return `${baseKey}:${uid}`;
}

/** Normalizes a Klox UI locale code into the BCP-47 languageCode expected by Firebase Auth. */
export function toFirebaseAuthLanguageCode(locale: string | null | undefined): 'pt-BR' | 'en' {
  const clean = (locale ?? '').trim().toLowerCase();
  if (clean.startsWith('pt')) {
    return 'pt-BR';
  }
  return 'en';
}

export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? '').trim();
}

export function isValidEmailAddress(raw: string | null | undefined): boolean {
  const clean = normalizeEmail(raw);
  if (!clean || clean.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean);
}

/**
 * Password reset flows must remain non-enumerating even when a Firebase project
 * does not have Email Enumeration Protection enabled.
 */
export function isNonEnumeratingResetError(err: unknown): boolean {
  const code = (err as { code?: string })?.code || '';
  return code.includes('user-not-found');
}

export function isContinueUriError(err: unknown): boolean {
  const code = (err as { code?: string })?.code || '';
  return code.includes('unauthorized-continue-uri') || code.includes('invalid-continue-uri');
}
