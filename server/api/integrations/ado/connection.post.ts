import {
  DEFAULT_ADO_COMPLETED_WORK_FIELD,
  LEGACY_ADO_CONNECTION_ID,
  normalizeAdoFieldRef,
  normalizeAdoOrgUrl,
  normalizeStoredAdoConnections,
  type AdoFieldOption,
} from '~/domain/ado';
import { UNASSIGNED_PROJECT_ID } from '~/domain/invariants';
import type { AdoConnectionSummary } from '~/domain/types';
import {
  getProjectWorkItemTypes,
  listAdoProjects,
  listProjectNumericFields,
} from '../../../utils/adoClient';
import {
  AdoCryptoError,
  decryptAdoTokenMap,
  encryptAdoTokenMap,
  type EncryptedAdoSecretPayload,
} from '../../../utils/adoCrypto';
import { enforceSlidingRateLimit, verifyBearerUser } from '../../../utils/firebaseAdmin';
import { getFirestoreUserDoc, patchFirestoreUserDoc } from '../../../utils/firestoreRest';

interface ConnectionRequestBody {
  connectionId?: string;
  kloxProjectId?: string;
  orgUrl: string;
  defaultProject?: string;
  defaultWorkItemType?: string;
  completedWorkFieldRef?: string;
  pat?: string;
  previewOnly?: boolean;
}

export default defineEventHandler(async (event) => {
  const { uid, projectId, idToken } = await verifyBearerUser(event);
  enforceSlidingRateLimit(`ado-connect:${uid}`, 20, 60_000);

  const body = await readBody<ConnectionRequestBody>(event);
  const norm = normalizeAdoOrgUrl(body?.orgUrl ?? '');
  if (!norm.valid) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ADO_INVALID_ORG_URL',
      data: { code: 'ADO_INVALID_ORG_URL' },
    });
  }

  const config = useRuntimeConfig(event);
  const masterSecret = String(config.adoEncryptionKey || '');
  const userDocPath = `users/${uid}`;
  const secretDocPath = `users/${uid}/secrets/azureDevOps`;

  const [userDoc, existingSecret] = await Promise.all([
    getFirestoreUserDoc<{ adoConnections?: unknown; adoConnection?: unknown }>({
      projectId,
      idToken,
      docPath: userDocPath,
    }),
    getFirestoreUserDoc<EncryptedAdoSecretPayload>({
      projectId,
      idToken,
      docPath: secretDocPath,
    }),
  ]);

  const existingConnections = normalizeStoredAdoConnections(userDoc);
  let tokenMap: Record<string, string> = {};

  if (existingSecret?.ciphertext) {
    try {
      tokenMap = decryptAdoTokenMap({
        payload: existingSecret,
        uid,
        masterSecret,
        isDev: import.meta.dev,
      });
    } catch (err) {
      if (err instanceof AdoCryptoError) {
        throw createError({
          statusCode: 503,
          statusMessage: 'ADO_SERVER_MISCONFIGURED',
          data: { code: 'ADO_SERVER_MISCONFIGURED' },
        });
      }
      if (!body?.pat?.trim()) {
        throw createError({
          statusCode: 401,
          statusMessage: 'ADO_AUTH_FAILED',
          data: { code: 'ADO_AUTH_FAILED' },
        });
      }
    }
  }

  const requestedConnId = body?.connectionId?.trim() || '';
  const previousConn = existingConnections.find(
    (c) => c.id === requestedConnId
  );
  const fieldCheck = normalizeAdoFieldRef(
    body?.completedWorkFieldRef !== undefined
      ? body.completedWorkFieldRef
      : previousConn?.completedWorkFieldRef
  );
  if (!fieldCheck.valid) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ADO_INVALID_INPUT',
      data: { code: 'ADO_INVALID_INPUT' },
    });
  }
  const activeFieldRef = fieldCheck.fieldRef;

  const suppliedPat = (body?.pat ?? '').trim();
  const patToUse =
    suppliedPat ||
    (requestedConnId ? tokenMap[requestedConnId] ?? tokenMap[LEGACY_ADO_CONNECTION_ID] : '') ||
    '';

  if (!patToUse) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ADO_INVALID_INPUT',
      data: { code: 'ADO_INVALID_INPUT' },
    });
  }

  const projects = await listAdoProjects({ orgUrl: norm.orgUrl, pat: patToUse });
  const requestedProject = (body?.defaultProject ?? '').trim() || projects[0]?.name || '';

  const safeFetchNumericFields = async (targetProj: string): Promise<AdoFieldOption[]> => {
    try {
      return await listProjectNumericFields({
        orgUrl: norm.orgUrl,
        pat: patToUse,
        project: targetProj,
      });
    } catch {
      return [];
    }
  };

  if (body?.previewOnly) {
    const matchedProj =
      projects.find((p) => p.name.toLowerCase() === requestedProject.toLowerCase())?.name ??
      requestedProject;
    const [workItemTypes, numericFields] = matchedProj
      ? await Promise.all([
          getProjectWorkItemTypes({
            orgUrl: norm.orgUrl,
            pat: patToUse,
            project: matchedProj,
            completedWorkFieldRef: activeFieldRef,
          }),
          safeFetchNumericFields(matchedProj),
        ])
      : [[], []];
    return {
      projects,
      workItemTypes,
      numericFields,
    };
  }

  const kloxProjectId = (body?.kloxProjectId ?? '').trim();
  if (!kloxProjectId || kloxProjectId === UNASSIGNED_PROJECT_ID || kloxProjectId.length > 128) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ADO_INVALID_INPUT',
      data: { code: 'ADO_INVALID_INPUT' },
    });
  }

  const defaultProject = (body?.defaultProject ?? '').trim();
  const defaultWorkItemType = (body?.defaultWorkItemType ?? 'Task').trim() || 'Task';
  if (!defaultProject) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ADO_INVALID_INPUT',
      data: { code: 'ADO_INVALID_INPUT' },
    });
  }

  const effectiveConnId =
    requestedConnId && requestedConnId !== LEGACY_ADO_CONNECTION_ID
      ? requestedConnId
      : `ado_${crypto.randomUUID().slice(0, 12)}`;

  const duplicateBinding = existingConnections.find(
    (c) => c.kloxProjectId === kloxProjectId && c.id !== effectiveConnId && c.id !== requestedConnId
  );
  if (duplicateBinding) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ADO_PROJECT_ALREADY_BOUND',
      data: { code: 'ADO_PROJECT_ALREADY_BOUND' },
    });
  }

  const [workItemTypes, numericFields] = await Promise.all([
    getProjectWorkItemTypes({
      orgUrl: norm.orgUrl,
      pat: patToUse,
      project: defaultProject,
      completedWorkFieldRef: activeFieldRef,
    }),
    safeFetchNumericFields(defaultProject),
  ]);

  const matchedProject =
    projects.find((p) => p.name.toLowerCase() === defaultProject.toLowerCase())?.name ??
    defaultProject;

  const existingPrev = existingConnections.find(
    (c) => c.id === effectiveConnId || (requestedConnId && c.id === requestedConnId)
  );

  const nowIso = new Date().toISOString();
  const tail = patToUse.slice(-4);
  const tokenHint = suppliedPat ? `••••${tail}` : existingPrev?.tokenHint || `••••${tail}`;

  const summary: AdoConnectionSummary = {
    id: effectiveConnId,
    kloxProjectId,
    connected: true,
    authType: 'pat',
    orgUrl: norm.orgUrl,
    organization: norm.organization,
    defaultProject: matchedProject,
    defaultWorkItemType,
    ...(activeFieldRef !== DEFAULT_ADO_COMPLETED_WORK_FIELD
      ? { completedWorkFieldRef: activeFieldRef }
      : {}),
    tokenHint,
    connectedAt: existingPrev?.connectedAt || nowIso,
    lastVerifiedAt: nowIso,
  };

  const nextTokenMap: Record<string, string> = { ...tokenMap };
  delete nextTokenMap[LEGACY_ADO_CONNECTION_ID];
  nextTokenMap[effectiveConnId] = patToUse;

  const updatedConnections = [
    ...existingConnections.filter(
      (c) => c.id !== effectiveConnId && c.id !== requestedConnId && c.id !== LEGACY_ADO_CONNECTION_ID
    ),
    summary,
  ];

  let encrypted: EncryptedAdoSecretPayload;
  try {
    encrypted = encryptAdoTokenMap({
      tokens: nextTokenMap,
      uid,
      masterSecret,
      isDev: import.meta.dev,
    });
  } catch (err) {
    if (err instanceof AdoCryptoError) {
      throw createError({
        statusCode: 503,
        statusMessage: 'ADO_SERVER_MISCONFIGURED',
        data: { code: 'ADO_SERVER_MISCONFIGURED' },
      });
    }
    throw err;
  }

  await Promise.all([
    patchFirestoreUserDoc({
      projectId,
      idToken,
      docPath: secretDocPath,
      data: {
        ...encrypted,
        authType: 'pat',
        updatedAt: nowIso,
      },
    }),
    patchFirestoreUserDoc({
      projectId,
      idToken,
      docPath: userDocPath,
      data: {
        adoConnections: updatedConnections,
        adoConnection: null,
        updatedAt: nowIso,
      },
      updateMaskFields: ['adoConnections', 'adoConnection', 'updatedAt'],
    }),
  ]);

  return {
    connection: summary,
    connections: updatedConnections,
    projects,
    workItemTypes,
    numericFields,
  };
});
