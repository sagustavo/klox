import { normalizeStoredAdoConnections } from '~/domain/ado';
import { enforceSlidingRateLimit, verifyBearerUser } from '../../../utils/firebaseAdmin';
import { getFirestoreUserDoc } from '../../../utils/firestoreRest';

export default defineEventHandler(async (event) => {
  const { uid, projectId, idToken } = await verifyBearerUser(event);
  enforceSlidingRateLimit(`ado:${uid}`, 60, 60_000);

  const userDoc = await getFirestoreUserDoc<{
    adoConnections?: unknown;
    adoConnection?: unknown;
  }>({
    projectId,
    idToken,
    docPath: `users/${uid}`,
  });

  const connections = normalizeStoredAdoConnections(userDoc);

  return {
    connections,
  };
});
