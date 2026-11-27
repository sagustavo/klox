import type { H3Event } from 'h3';
import {
  buildAdoWorkItemWebUrl,
  escapeWiqlLiteral,
  normalizeAdoOrgUrl,
  parseWorkItemIdInput,
  roundHours2,
  type AdoErrorCode,
  type AdoWorkItemSummary,
  type AdoWorkItemTypeCapability,
} from '~/domain/ado';
import type { AdoConnectionSummary } from '~/domain/types';
import { AdoCryptoError, decryptAdoSecret, type EncryptedAdoSecretPayload } from './adoCrypto';
import { enforceSlidingRateLimit, verifyBearerUser } from './firebaseAdmin';
import { getFirestoreUserDoc } from './firestoreRest';

const ADO_API_VERSION = '7.1';
const REQUEST_TIMEOUT_MS = 12_000;
const TYPE_CACHE_TTL_MS = 5 * 60 * 1000;

const typeCapabilitiesCache = new Map<
  string,
  { expiresAt: number; types: AdoWorkItemTypeCapability[] }
>();

export interface AdoProjectInfo {
  id: string;
  name: string;
}

export interface AdoPushItemResult {
  workItemId: number;
  ok: boolean;
  title?: string;
  workItemType?: string;
  previousCompletedWork?: number;
  newCompletedWork?: number;
  url?: string;
  errorCode?: AdoErrorCode;
}

function createAdoError(statusCode: number, code: AdoErrorCode) {
  return createError({
    statusCode,
    statusMessage: code,
    data: { code },
  });
}

function extractAdoErrorCode(err: unknown): AdoErrorCode {
  const dataCode = (err as { data?: { data?: { code?: string }; code?: string }; statusMessage?: string })
    ?.data?.data?.code;
  const directCode = (err as { data?: { code?: string }; statusMessage?: string })?.data?.code;
  const msg = (err as { statusMessage?: string })?.statusMessage;
  const candidate = dataCode || directCode || msg;
  if (candidate && candidate.startsWith('ADO_')) {
    return candidate as AdoErrorCode;
  }
  return 'ADO_UNAVAILABLE';
}

function basicAuthHeader(pat: string): string {
  const encoded = Buffer.from(`:${pat}`, 'utf8').toString('base64');
  return `Basic ${encoded}`;
}

async function adoFetchJson<T>(
  url: string,
  pat: string,
  init: RequestInit = {}
): Promise<T> {
  if (!url.startsWith('https://dev.azure.com/')) {
    throw createAdoError(400, 'ADO_INVALID_ORG_URL');
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', basicAuthHeader(pat));
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    console.warn('[Klox ADO fetch network error]', err);
    throw createAdoError(503, 'ADO_UNAVAILABLE');
  }

  // Azure DevOps responds with 203 Non-Authoritative HTML login redirect when PAT is invalid/expired
  if (res.status === 203 || res.status === 401) {
    throw createAdoError(401, 'ADO_AUTH_FAILED');
  }
  if (res.status === 403) {
    throw createAdoError(403, 'ADO_FORBIDDEN');
  }
  if (res.status === 404) {
    throw createAdoError(404, 'ADO_NOT_FOUND');
  }
  if (res.status === 429) {
    throw createAdoError(429, 'ADO_RATE_LIMITED');
  }
  if (res.status === 409 || res.status === 412) {
    throw createAdoError(409, 'ADO_CONFLICT');
  }

  const text = await res.text();
  if (!res.ok) {
    if (
      res.status === 400 &&
      text.includes('Microsoft.VSTS.Scheduling.CompletedWork')
    ) {
      throw createAdoError(400, 'ADO_COMPLETED_WORK_UNSUPPORTED');
    }
    console.warn('[Klox ADO API error]', res.status, text.slice(0, 300));
    throw createAdoError(res.status >= 400 && res.status < 500 ? 400 : 502, 'ADO_UNAVAILABLE');
  }

  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw createAdoError(401, 'ADO_AUTH_FAILED');
  }
}

export async function loadUserAdoContext(event: H3Event): Promise<{
  uid: string;
  projectId: string;
  idToken: string;
  connection: AdoConnectionSummary;
  pat: string;
}> {
  const { uid, projectId, idToken } = await verifyBearerUser(event);
  enforceSlidingRateLimit(`ado:${uid}`, 60, 60_000);

  const [userDoc, secretPayload] = await Promise.all([
    getFirestoreUserDoc<{ adoConnection?: AdoConnectionSummary | null }>({
      projectId,
      idToken,
      docPath: `users/${uid}`,
    }),
    getFirestoreUserDoc<EncryptedAdoSecretPayload>({
      projectId,
      idToken,
      docPath: `users/${uid}/secrets/azureDevOps`,
    }),
  ]);

  const connection = userDoc?.adoConnection ?? undefined;

  if (!connection?.connected || !secretPayload?.ciphertext) {
    throw createAdoError(400, 'ADO_NOT_CONNECTED');
  }

  const config = useRuntimeConfig(event);
  let pat: string;
  try {
    pat = decryptAdoSecret({
      payload: secretPayload,
      uid,
      masterSecret: String(config.adoEncryptionKey || ''),
      isDev: import.meta.dev,
    });
  } catch (err) {
    if (err instanceof AdoCryptoError) {
      throw createAdoError(503, 'ADO_SERVER_MISCONFIGURED');
    }
    throw createAdoError(401, 'ADO_AUTH_FAILED');
  }

  return { uid, projectId, idToken, connection, pat };
}

export function resolveTargetOrgAndProject(
  connection: AdoConnectionSummary,
  overrideOrgUrl?: string,
  overrideProject?: string
): { orgUrl: string; organization: string; project: string } {
  const rawOrg = overrideOrgUrl?.trim() || connection.orgUrl;
  const norm = normalizeAdoOrgUrl(rawOrg);
  if (!norm.valid) {
    throw createAdoError(400, 'ADO_INVALID_ORG_URL');
  }
  const project = (overrideProject?.trim() || connection.defaultProject).trim();
  if (!project) {
    throw createAdoError(400, 'ADO_INVALID_INPUT');
  }
  return {
    orgUrl: norm.orgUrl,
    organization: norm.organization,
    project,
  };
}

export async function listAdoProjects(params: {
  orgUrl: string;
  pat: string;
}): Promise<AdoProjectInfo[]> {
  const norm = normalizeAdoOrgUrl(params.orgUrl);
  if (!norm.valid) throw createAdoError(400, 'ADO_INVALID_ORG_URL');

  const url = `${norm.orgUrl}/_apis/projects?$top=200&api-version=${ADO_API_VERSION}`;
  const res = await adoFetchJson<{ value?: Array<{ id?: string; name?: string }> }>(
    url,
    params.pat
  );

  return (res.value ?? [])
    .filter((p): p is { id: string; name: string } => Boolean(p.id && p.name))
    .map((p) => ({ id: p.id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function hasCompletedWorkField(rawType: {
  fields?: Array<{ referenceName?: string }>;
  fieldInstances?: Array<{ referenceName?: string }>;
}): boolean | null {
  const list = Array.isArray(rawType.fields)
    ? rawType.fields
    : Array.isArray(rawType.fieldInstances)
      ? rawType.fieldInstances
      : null;
  if (!list) return null;
  return list.some(
    (f) => f.referenceName?.toLowerCase() === 'microsoft.vsts.scheduling.completedwork'
  );
}

export async function getProjectWorkItemTypes(params: {
  orgUrl: string;
  pat: string;
  project: string;
}): Promise<AdoWorkItemTypeCapability[]> {
  const norm = normalizeAdoOrgUrl(params.orgUrl);
  if (!norm.valid) throw createAdoError(400, 'ADO_INVALID_ORG_URL');

  const cacheKey = `${norm.orgUrl.toLowerCase()}::${params.project.toLowerCase()}`;
  const cached = typeCapabilitiesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.types;
  }

  const url = `${norm.orgUrl}/${encodeURIComponent(params.project)}/_apis/wit/workitemtypes?api-version=${ADO_API_VERSION}`;
  const res = await adoFetchJson<{
    value?: Array<{
      name?: string;
      isDisabled?: boolean;
      fields?: Array<{ referenceName?: string }>;
      fieldInstances?: Array<{ referenceName?: string }>;
    }>;
  }>(url, params.pat);

  const types: AdoWorkItemTypeCapability[] = [];
  for (const wt of res.value ?? []) {
    if (!wt.name || wt.isDisabled) continue;
    let supportsCompletedWork = hasCompletedWorkField(wt);
    if (supportsCompletedWork === null) {
      // Fallback single-type inspection if list payload omitted fields
      try {
        const detailUrl = `${norm.orgUrl}/${encodeURIComponent(params.project)}/_apis/wit/workitemtypes/${encodeURIComponent(wt.name)}?api-version=${ADO_API_VERSION}`;
        const detail = await adoFetchJson<{
          fields?: Array<{ referenceName?: string }>;
          fieldInstances?: Array<{ referenceName?: string }>;
        }>(detailUrl, params.pat);
        supportsCompletedWork = hasCompletedWorkField(detail) ?? false;
      } catch {
        supportsCompletedWork = false;
      }
    }
    types.push({
      name: wt.name,
      supportsCompletedWork,
    });
  }

  types.sort((a, b) => a.name.localeCompare(b.name));
  typeCapabilitiesCache.set(cacheKey, {
    expiresAt: Date.now() + TYPE_CACHE_TTL_MS,
    types,
  });

  return types;
}

interface RawAdoWorkItem {
  id: number;
  rev?: number;
  fields?: Record<string, unknown>;
}

function mapRawWorkItem(
  raw: RawAdoWorkItem,
  orgUrl: string,
  project: string,
  supportByType: Map<string, boolean>
): AdoWorkItemSummary {
  const fields = raw.fields ?? {};
  const title = String(fields['System.Title'] ?? `#${raw.id}`);
  const workItemType = String(fields['System.WorkItemType'] ?? 'Task');
  const rawCompleted = Number(fields['Microsoft.VSTS.Scheduling.CompletedWork'] ?? 0);
  const completedWork = Number.isFinite(rawCompleted) ? roundHours2(rawCompleted) : 0;
  const supportsCompletedWork = supportByType.get(workItemType.toLowerCase()) ?? false;

  return {
    id: raw.id,
    title,
    workItemType,
    completedWork,
    url: buildAdoWorkItemWebUrl(orgUrl, project, raw.id),
    supportsCompletedWork,
  };
}

export async function getAdoWorkItemsByIds(params: {
  orgUrl: string;
  pat: string;
  project: string;
  ids: readonly number[];
}): Promise<AdoWorkItemSummary[]> {
  const norm = normalizeAdoOrgUrl(params.orgUrl);
  if (!norm.valid) throw createAdoError(400, 'ADO_INVALID_ORG_URL');

  const uniqueIds = Array.from(
    new Set(params.ids.filter((id) => Number.isInteger(id) && id > 0))
  );
  if (uniqueIds.length === 0) return [];

  const types = await getProjectWorkItemTypes({
    orgUrl: norm.orgUrl,
    pat: params.pat,
    project: params.project,
  });
  const supportByType = new Map(types.map((t) => [t.name.toLowerCase(), t.supportsCompletedWork]));

  const results: AdoWorkItemSummary[] = [];
  const CHUNK_SIZE = 200;

  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
    const url = `${norm.orgUrl}/${encodeURIComponent(params.project)}/_apis/wit/workitemsbatch?api-version=${ADO_API_VERSION}`;
    const res = await adoFetchJson<{ value?: RawAdoWorkItem[] }>(url, params.pat, {
      method: 'POST',
      body: JSON.stringify({
        ids: chunk,
        fields: [
          'System.Id',
          'System.Title',
          'System.WorkItemType',
          'Microsoft.VSTS.Scheduling.CompletedWork',
        ],
        errorPolicy: 'Omit',
      }),
    });

    for (const item of res.value ?? []) {
      if (item && Number.isInteger(item.id)) {
        results.push(mapRawWorkItem(item, norm.orgUrl, params.project, supportByType));
      }
    }
  }

  return results;
}

export async function searchAdoWorkItems(params: {
  orgUrl: string;
  pat: string;
  project: string;
  queryText: string;
  top?: number;
}): Promise<AdoWorkItemSummary[]> {
  const norm = normalizeAdoOrgUrl(params.orgUrl);
  if (!norm.valid) throw createAdoError(400, 'ADO_INVALID_ORG_URL');

  const trimmed = params.queryText.trim();
  const parsedId = parseWorkItemIdInput(trimmed);
  if (parsedId !== null) {
    return getAdoWorkItemsByIds({
      orgUrl: norm.orgUrl,
      pat: params.pat,
      project: params.project,
      ids: [parsedId],
    });
  }

  const boundedTop = Math.min(Math.max(1, params.top ?? 20), 50);
  const safeFilter = escapeWiqlLiteral(trimmed);
  const whereClause = safeFilter
    ? `[System.TeamProject] = @project AND [System.Title] CONTAINS '${safeFilter}'`
    : `[System.TeamProject] = @project`;

  const wiql = `SELECT [System.Id] FROM WorkItems WHERE ${whereClause} ORDER BY [System.ChangedDate] DESC`;
  const wiqlUrl = `${norm.orgUrl}/${encodeURIComponent(params.project)}/_apis/wit/wiql?$top=${boundedTop}&api-version=${ADO_API_VERSION}`;

  const wiqlRes = await adoFetchJson<{ workItems?: Array<{ id: number }> }>(
    wiqlUrl,
    params.pat,
    {
      method: 'POST',
      body: JSON.stringify({ query: wiql }),
    }
  );

  const ids = (wiqlRes.workItems ?? []).map((w) => w.id).slice(0, boundedTop);
  if (ids.length === 0) return [];

  return getAdoWorkItemsByIds({
    orgUrl: norm.orgUrl,
    pat: params.pat,
    project: params.project,
    ids,
  });
}

export async function createAdoWorkItem(params: {
  orgUrl: string;
  pat: string;
  project: string;
  workItemType: string;
  title: string;
  initialCompletedWork?: number;
}): Promise<AdoWorkItemSummary> {
  const norm = normalizeAdoOrgUrl(params.orgUrl);
  if (!norm.valid) throw createAdoError(400, 'ADO_INVALID_ORG_URL');

  const cleanTitle = params.title.trim().slice(0, 255);
  const cleanType = params.workItemType.trim();
  if (!cleanTitle || !cleanType) {
    throw createAdoError(400, 'ADO_INVALID_INPUT');
  }

  const types = await getProjectWorkItemTypes({
    orgUrl: norm.orgUrl,
    pat: params.pat,
    project: params.project,
  });
  const typeMeta = types.find((t) => t.name.toLowerCase() === cleanType.toLowerCase());
  const supportsCompletedWork = typeMeta?.supportsCompletedWork ?? false;

  const patchOps: Array<{ op: 'add'; path: string; value: string | number }> = [
    { op: 'add', path: '/fields/System.Title', value: cleanTitle },
  ];

  const cleanHours = roundHours2(params.initialCompletedWork ?? 0);
  if (cleanHours > 0 && supportsCompletedWork) {
    patchOps.push({
      op: 'add',
      path: '/fields/Microsoft.VSTS.Scheduling.CompletedWork',
      value: cleanHours,
    });
  }

  const url = `${norm.orgUrl}/${encodeURIComponent(params.project)}/_apis/wit/workitems/$${encodeURIComponent(cleanType)}?api-version=${ADO_API_VERSION}`;
  const created = await adoFetchJson<RawAdoWorkItem>(url, params.pat, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json-patch+json' },
    body: JSON.stringify(patchOps),
  });

  const supportMap = new Map([[cleanType.toLowerCase(), supportsCompletedWork]]);
  return mapRawWorkItem(created, norm.orgUrl, params.project, supportMap);
}

/**
 * Strictly updates ONLY `Microsoft.VSTS.Scheduling.CompletedWork` on an existing ADO Work Item
 * using an optimistic `/rev` test patch (with 1 conflict retry).
 */
export async function patchAdoCompletedWork(params: {
  orgUrl: string;
  pat: string;
  project: string;
  workItemId: number;
  approvedDeltaHours: number;
}): Promise<AdoPushItemResult> {
  const norm = normalizeAdoOrgUrl(params.orgUrl);
  if (!norm.valid) {
    return { workItemId: params.workItemId, ok: false, errorCode: 'ADO_INVALID_ORG_URL' };
  }

  const delta = roundHours2(params.approvedDeltaHours);
  if (!Number.isFinite(delta) || delta <= 0) {
    return { workItemId: params.workItemId, ok: false, errorCode: 'ADO_INVALID_INPUT' };
  }

  const types = await getProjectWorkItemTypes({
    orgUrl: norm.orgUrl,
    pat: params.pat,
    project: params.project,
  });
  const supportByType = new Map(types.map((t) => [t.name.toLowerCase(), t.supportsCompletedWork]));

  const itemUrl = `${norm.orgUrl}/${encodeURIComponent(params.project)}/_apis/wit/workitems/${params.workItemId}?fields=System.Id,System.Title,System.WorkItemType,Microsoft.VSTS.Scheduling.CompletedWork&api-version=${ADO_API_VERSION}`;
  const patchUrl = `${norm.orgUrl}/${encodeURIComponent(params.project)}/_apis/wit/workitems/${params.workItemId}?api-version=${ADO_API_VERSION}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const live = await adoFetchJson<RawAdoWorkItem>(itemUrl, params.pat);
      const fields = live.fields ?? {};
      const title = String(fields['System.Title'] ?? `#${params.workItemId}`);
      const workItemType = String(fields['System.WorkItemType'] ?? 'Task');
      const rev = typeof live.rev === 'number' ? live.rev : null;
      const rawCurrent = Number(fields['Microsoft.VSTS.Scheduling.CompletedWork'] ?? 0);
      const previousCompletedWork = Number.isFinite(rawCurrent) ? roundHours2(rawCurrent) : 0;

      const supportsCompletedWork = supportByType.get(workItemType.toLowerCase()) ?? false;
      if (!supportsCompletedWork) {
        return {
          workItemId: params.workItemId,
          ok: false,
          title,
          workItemType,
          previousCompletedWork,
          errorCode: 'ADO_COMPLETED_WORK_UNSUPPORTED',
        };
      }

      const nextCompletedWork = roundHours2(previousCompletedWork + delta);
      const patchOps: Array<{ op: string; path: string; value: number }> = [];
      if (rev !== null) {
        patchOps.push({ op: 'test', path: '/rev', value: rev });
      }
      patchOps.push({
        op: 'add',
        path: '/fields/Microsoft.VSTS.Scheduling.CompletedWork',
        value: nextCompletedWork,
      });

      const updated = await adoFetchJson<RawAdoWorkItem>(patchUrl, params.pat, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json-patch+json' },
        body: JSON.stringify(patchOps),
      });

      const updatedCompleted = Number(
        updated.fields?.['Microsoft.VSTS.Scheduling.CompletedWork'] ?? nextCompletedWork
      );

      return {
        workItemId: params.workItemId,
        ok: true,
        title: String(updated.fields?.['System.Title'] ?? title),
        workItemType: String(updated.fields?.['System.WorkItemType'] ?? workItemType),
        previousCompletedWork,
        newCompletedWork: Number.isFinite(updatedCompleted)
          ? roundHours2(updatedCompleted)
          : nextCompletedWork,
        url: buildAdoWorkItemWebUrl(norm.orgUrl, params.project, params.workItemId),
      };
    } catch (err) {
      const code = extractAdoErrorCode(err);
      if (code === 'ADO_CONFLICT' && attempt === 0) {
        continue;
      }
      return {
        workItemId: params.workItemId,
        ok: false,
        errorCode: code,
      };
    }
  }

  return { workItemId: params.workItemId, ok: false, errorCode: 'ADO_CONFLICT' };
}
