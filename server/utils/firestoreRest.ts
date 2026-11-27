export type FirestoreRestValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreRestValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreRestValue> } };

interface FirestoreRestDocument {
  name?: string;
  fields?: Record<string, FirestoreRestValue>;
  createTime?: string;
  updateTime?: string;
}

const FIRESTORE_TIMEOUT_MS = 12_000;

export function toFirestoreValue(value: unknown): FirestoreRestValue {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }
  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { integerValue: '0' };
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (value instanceof Date) {
    return { stringValue: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.filter((item) => item !== undefined).map((item) => toFirestoreValue(item)),
      },
    };
  }
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: toFirestoreFields(value as Record<string, unknown>),
      },
    };
  }
  return { stringValue: String(value) };
}

export function toFirestoreFields(
  record: Record<string, unknown>
): Record<string, FirestoreRestValue> {
  const fields: Record<string, FirestoreRestValue> = {};
  for (const [key, val] of Object.entries(record)) {
    if (val === undefined) continue;
    fields[key] = toFirestoreValue(val);
  }
  return fields;
}

export function fromFirestoreValue(
  raw: FirestoreRestValue | Record<string, unknown> | undefined
): unknown {
  if (!raw || typeof raw !== 'object') return undefined;
  if ('nullValue' in raw) return null;
  if ('booleanValue' in raw) return Boolean(raw.booleanValue);
  if ('integerValue' in raw) {
    const n = Number(raw.integerValue);
    return Number.isFinite(n) ? n : 0;
  }
  if ('doubleValue' in raw) {
    const n = Number(raw.doubleValue);
    return Number.isFinite(n) ? n : 0;
  }
  if ('stringValue' in raw) return String(raw.stringValue ?? '');
  if ('timestampValue' in raw) return String(raw.timestampValue ?? '');
  if ('arrayValue' in raw) {
    const values = (raw.arrayValue as { values?: FirestoreRestValue[] } | undefined)?.values;
    if (!Array.isArray(values)) return [];
    return values.map((item) => fromFirestoreValue(item));
  }
  if ('mapValue' in raw) {
    const fields = (raw.mapValue as { fields?: Record<string, FirestoreRestValue> } | undefined)
      ?.fields;
    return fromFirestoreFields(fields);
  }
  return undefined;
}

export function fromFirestoreFields(
  fields: Record<string, FirestoreRestValue> | undefined
): Record<string, unknown> {
  if (!fields) return {};
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(fields)) {
    const decoded = fromFirestoreValue(val);
    if (decoded !== undefined) {
      result[key] = decoded;
    }
  }
  return result;
}

function buildFirestoreDocUrl(
  projectId: string,
  docPath: string,
  updateMaskFields?: readonly string[]
): string {
  const cleanPath = docPath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${cleanPath}`;
  if (!updateMaskFields || updateMaskFields.length === 0) {
    return base;
  }
  const params = updateMaskFields
    .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join('&');
  return `${base}?${params}`;
}

async function throwFirestoreRestError(
  res: Response,
  projectId: string,
  docPath: string
): Promise<never> {
  const body = await res.text().catch(() => '');
  if (res.status === 401) {
    throw createError({
      statusCode: 401,
      statusMessage: 'AUTH_INVALID',
      data: { code: 'AUTH_INVALID' },
    });
  }
  if (res.status === 403) {
    console.warn(
      `[Klox Firestore REST 403] Deploy updated firestore.rules: npx -y firebase-tools@latest deploy --only firestore:rules --project ${projectId} (path: ${docPath})`,
      body.slice(0, 300)
    );
    throw createError({
      statusCode: 403,
      statusMessage: 'ADO_FIRESTORE_PERMISSION_DENIED',
      data: { code: 'ADO_FIRESTORE_PERMISSION_DENIED' },
    });
  }
  console.warn('[Klox Firestore REST error]', res.status, docPath, body.slice(0, 300));
  throw createError({
    statusCode: 503,
    statusMessage: 'ADO_UNAVAILABLE',
    data: { code: 'ADO_UNAVAILABLE' },
  });
}

async function firestoreFetch(
  url: string,
  idToken: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${idToken}`);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    return await fetch(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(FIRESTORE_TIMEOUT_MS),
    });
  } catch (err) {
    console.warn('[Klox Firestore REST network error]', err);
    throw createError({
      statusCode: 503,
      statusMessage: 'ADO_UNAVAILABLE',
      data: { code: 'ADO_UNAVAILABLE' },
    });
  }
}

export async function getFirestoreUserDoc<T = Record<string, unknown>>(params: {
  projectId: string;
  idToken: string;
  docPath: string;
}): Promise<T | null> {
  const url = buildFirestoreDocUrl(params.projectId, params.docPath);
  const res = await firestoreFetch(url, params.idToken, { method: 'GET' });
  if (res.status === 404) return null;
  if (!res.ok) {
    await throwFirestoreRestError(res, params.projectId, params.docPath);
  }
  const doc = (await res.json()) as FirestoreRestDocument;
  return fromFirestoreFields(doc.fields) as T;
}

export async function patchFirestoreUserDoc(params: {
  projectId: string;
  idToken: string;
  docPath: string;
  data: Record<string, unknown>;
  updateMaskFields?: readonly string[];
}): Promise<void> {
  const url = buildFirestoreDocUrl(
    params.projectId,
    params.docPath,
    params.updateMaskFields
  );
  const res = await firestoreFetch(url, params.idToken, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: toFirestoreFields(params.data),
    }),
  });
  if (!res.ok) {
    await throwFirestoreRestError(res, params.projectId, params.docPath);
  }
}

export async function deleteFirestoreUserDoc(params: {
  projectId: string;
  idToken: string;
  docPath: string;
}): Promise<void> {
  const url = buildFirestoreDocUrl(params.projectId, params.docPath);
  const res = await firestoreFetch(url, params.idToken, { method: 'DELETE' });
  if (res.status === 404) return;
  if (!res.ok) {
    await throwFirestoreRestError(res, params.projectId, params.docPath);
  }
}
