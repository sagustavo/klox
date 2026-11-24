export type AuthErrorCode =
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_EMAIL_IN_USE'
  | 'AUTH_WEAK_PASSWORD'
  | 'AUTH_POPUP_CLOSED'
  | 'AUTH_POPUP_BLOCKED'
  | 'AUTH_UNAUTHORIZED_DOMAIN'
  | 'AUTH_PROVIDER_DISABLED'
  | 'AUTH_GENERIC_ERROR';

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
  return 'AUTH_GENERIC_ERROR';
}

/** Scopes a browser storage key to the active user/demo uid to prevent cross-account cache bleed. */
export function tenantStorageKey(baseKey: string, uid: string): string {
  return `${baseKey}:${uid}`;
}
