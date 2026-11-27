import { normalizeAdoOrgUrl } from '~/domain/ado';
import type { AdoConnectionSummary } from '~/domain/types';
import {
  getProjectWorkItemTypes,
  listAdoProjects,
} from '../../../utils/adoClient';
import {
  AdoCryptoError,
  decryptAdoSecret,
  encryptAdoSecret,
  type EncryptedAdoSecretPayload,
} from '../../../utils/adoCrypto';
import { enforceSlidingRateLimit, verifyBearerUser } from '../../../utils/firebaseAdmin';
import { getFirestoreUserDoc, patchFirestoreUserDoc } from '../../../utils/firestoreRest';

interface ConnectionRequestBody {
  orgUrl: string;
  defaultProject: string;
  defaultWorkItemType?: string;
  pat?: string;
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

  const defaultProject = (body?.defaultProject ?? '').trim();
  const defaultWorkItemType = (body?.defaultWorkItemType ?? 'Task').trim() || 'Task';
  if (!defaultProject) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ADO_INVALID_INPUT',
      data: { code: 'ADO_INVALID_INPUT' },
    });
  }

  const config = useRuntimeConfig(event);
  const masterSecret = String(config.adoEncryptionKey || '');

  const userDocPath = `users/${uid}`;
  const secretDocPath = `users/${uid}/secrets/azureDevOps`;

  let patToUse = (body?.pat ?? '').trim();
  let previousHint = '';
  let previousConnectedAt: string | undefined;

  if (!patToUse) {
    const [userDoc, existingSecret] = await Promise.all([
      getFirestoreUserDoc<{ adoConnection?: AdoConnectionSummary | null }>({
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
    const existingConn = userDoc?.adoConnection ?? undefined;
    if (!existingSecret?.ciphertext) {
      throw createError({
        statusCode: 400,
        statusMessage: 'ADO_INVALID_INPUT',
        data: { code: 'ADO_INVALID_INPUT' },
      });
    }
    try {
      patToUse = decryptAdoSecret({
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
      throw createError({
        statusCode: 401,
        statusMessage: 'ADO_AUTH_FAILED',
        data: { code: 'ADO_AUTH_FAILED' },
      });
    }
    previousHint = existingConn?.tokenHint ?? '';
    previousConnectedAt = existingConn?.connectedAt;
  }

  const [projects, workItemTypes] = await Promise.all([
    listAdoProjects({ orgUrl: norm.orgUrl, pat: patToUse }),
    getProjectWorkItemTypes({
      orgUrl: norm.orgUrl,
      pat: patToUse,
      project: defaultProject,
    }),
  ]);

  const matchedProject =
    projects.find((p) => p.name.toLowerCase() === defaultProject.toLowerCase())?.name ??
    defaultProject;

  const nowIso = new Date().toISOString();
  const tail = patToUse.slice(-4);
  const tokenHint = body?.pat?.trim() ? `••••${tail}` : previousHint || `••••${tail}`;

  let encrypted: EncryptedAdoSecretPayload;
  try {
    encrypted = encryptAdoSecret({
      plaintext: patToUse,
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

  const summary: AdoConnectionSummary = {
    connected: true,
    authType: 'pat',
    orgUrl: norm.orgUrl,
    organization: norm.organization,
    defaultProject: matchedProject,
    defaultWorkItemType,
    tokenHint,
    connectedAt: previousConnectedAt ?? nowIso,
    lastVerifiedAt: nowIso,
  };

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
        adoConnection: summary,
        updatedAt: nowIso,
      },
      updateMaskFields: ['adoConnection', 'updatedAt'],
    }),
  ]);

  return {
    connection: summary,
    projects,
    workItemTypes,
  };
});
