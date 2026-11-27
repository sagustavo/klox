import type { AdoConnectionSummary } from '~/domain/types';
import { enforceSlidingRateLimit, verifyBearerUser } from '../../../utils/firebaseAdmin';
import { getFirestoreUserDoc } from '../../../utils/firestoreRest';

export default defineEventHandler(async (event) => {
  const { uid, projectId, idToken } = await verifyBearerUser(event);
  enforceSlidingRateLimit(`ado:${uid}`, 60, 60_000);

  const userDoc = await getFirestoreUserDoc<{ adoConnection?: AdoConnectionSummary | null }>({
    projectId,
    idToken,
    docPath: `users/${uid}`,
  });
  const connection = userDoc?.adoConnection ?? null;

  return {
    connection: connection?.connected ? connection : null,
  };
});
