import type { H3Event } from 'h3';

const rateBuckets = new Map<string, number[]>();

export function enforceSlidingRateLimit(
  bucketKey: string,
  maxRequests = 40,
  windowMs = 60_000
): void {
  const now = Date.now();
  const prev = (rateBuckets.get(bucketKey) ?? []).filter((ts) => now - ts < windowMs);
  if (prev.length >= maxRequests) {
    rateBuckets.set(bucketKey, prev);
    throw createError({
      statusCode: 429,
      statusMessage: 'ADO_RATE_LIMITED',
      data: { code: 'ADO_RATE_LIMITED' },
    });
  }
  prev.push(now);
  rateBuckets.set(bucketKey, prev);
}

export async function getAdminApp(projectId?: string) {
  const { getApps, initializeApp } = await import('firebase-admin/app');
  const existing = getApps()[0];
  if (existing) return existing;
  return initializeApp(projectId ? { projectId } : undefined);
}

export async function verifyBearerUser(event: H3Event): Promise<{
  uid: string;
  projectId: string;
  idToken: string;
}> {
  const config = useRuntimeConfig(event);
  const projectId = String(config.public?.firebaseProjectId || '');
  if (!projectId) {
    throw createError({
      statusCode: 503,
      statusMessage: 'ADO_SERVER_MISCONFIGURED',
      data: { code: 'ADO_SERVER_MISCONFIGURED' },
    });
  }
  const authHeader = getHeader(event, 'authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    throw createError({
      statusCode: 401,
      statusMessage: 'AUTH_INVALID',
      data: { code: 'AUTH_INVALID' },
    });
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    throw createError({
      statusCode: 401,
      statusMessage: 'AUTH_INVALID',
      data: { code: 'AUTH_INVALID' },
    });
  }

  try {
    const app = await getAdminApp(projectId);
    const { getAuth } = await import('firebase-admin/auth');
    const decoded = await getAuth(app).verifyIdToken(idToken);
    return { uid: decoded.uid, projectId, idToken };
  } catch (err) {
    console.warn('[Klox Firebase Admin verifyIdToken failed]', err);
    throw createError({
      statusCode: 401,
      statusMessage: 'AUTH_INVALID',
      data: { code: 'AUTH_INVALID' },
    });
  }
}
