import {
  LEGACY_ADO_CONNECTION_ID,
  normalizeStoredAdoConnections,
} from '~/domain/ado';
import {
  decryptAdoTokenMap,
  encryptAdoTokenMap,
  type EncryptedAdoSecretPayload,
} from '../../../utils/adoCrypto';
import { enforceSlidingRateLimit, verifyBearerUser } from '../../../utils/firebaseAdmin';
import {
  deleteFirestoreUserDoc,
  getFirestoreUserDoc,
  patchFirestoreUserDoc,
} from '../../../utils/firestoreRest';

export default defineEventHandler(async (event) => {
  const { uid, projectId, idToken } = await verifyBearerUser(event);
  enforceSlidingRateLimit(`ado-disconnect:${uid}`, 20, 60_000);

  const query = getQuery(event);
  const connectionId = typeof query.connectionId === 'string' ? query.connectionId.trim() : '';

  const userDocPath = `users/${uid}`;
  const secretDocPath = `users/${uid}/secrets/azureDevOps`;
  const nowIso = new Date().toISOString();

  if (!connectionId) {
    await Promise.all([
      deleteFirestoreUserDoc({
        projectId,
        idToken,
        docPath: secretDocPath,
      }),
      patchFirestoreUserDoc({
        projectId,
        idToken,
        docPath: userDocPath,
        data: {
          adoConnections: [],
          adoConnection: null,
          updatedAt: nowIso,
        },
        updateMaskFields: ['adoConnections', 'adoConnection', 'updatedAt'],
      }),
    ]);

    return { ok: true, connections: [] };
  }

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
  const remainingConnections = existingConnections.filter((c) => c.id !== connectionId);

  if (remainingConnections.length === 0) {
    await Promise.all([
      deleteFirestoreUserDoc({
        projectId,
        idToken,
        docPath: secretDocPath,
      }),
      patchFirestoreUserDoc({
        projectId,
        idToken,
        docPath: userDocPath,
        data: {
          adoConnections: [],
          adoConnection: null,
          updatedAt: nowIso,
        },
        updateMaskFields: ['adoConnections', 'adoConnection', 'updatedAt'],
      }),
    ]);
    return { ok: true, connections: [] };
  }

  const config = useRuntimeConfig(event);
  const masterSecret = String(config.adoEncryptionKey || '');
  const ops: Promise<unknown>[] = [
    patchFirestoreUserDoc({
      projectId,
      idToken,
      docPath: userDocPath,
      data: {
        adoConnections: remainingConnections,
        adoConnection: null,
        updatedAt: nowIso,
      },
      updateMaskFields: ['adoConnections', 'adoConnection', 'updatedAt'],
    }),
  ];

  if (existingSecret?.ciphertext) {
    try {
      const tokens = decryptAdoTokenMap({
        payload: existingSecret,
        uid,
        masterSecret,
        isDev: import.meta.dev,
      });
      delete tokens[connectionId];
      if (connectionId === LEGACY_ADO_CONNECTION_ID) {
        delete tokens[LEGACY_ADO_CONNECTION_ID];
      }
      const encrypted = encryptAdoTokenMap({
        tokens,
        uid,
        masterSecret,
        isDev: import.meta.dev,
      });
      ops.push(
        patchFirestoreUserDoc({
          projectId,
          idToken,
          docPath: secretDocPath,
          data: {
            ...encrypted,
            authType: 'pat',
            updatedAt: nowIso,
          },
        })
      );
    } catch {
      // Non-fatal if vault cannot be updated while disconnecting
    }
  }

  await Promise.all(ops);

  return { ok: true, connections: remainingConnections };
});
