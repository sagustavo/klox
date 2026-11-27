import { enforceSlidingRateLimit, verifyBearerUser } from '../../../utils/firebaseAdmin';
import { deleteFirestoreUserDoc, patchFirestoreUserDoc } from '../../../utils/firestoreRest';

export default defineEventHandler(async (event) => {
  const { uid, projectId, idToken } = await verifyBearerUser(event);
  enforceSlidingRateLimit(`ado-disconnect:${uid}`, 20, 60_000);

  const nowIso = new Date().toISOString();

  await Promise.all([
    deleteFirestoreUserDoc({
      projectId,
      idToken,
      docPath: `users/${uid}/secrets/azureDevOps`,
    }),
    patchFirestoreUserDoc({
      projectId,
      idToken,
      docPath: `users/${uid}`,
      data: {
        adoConnection: null,
        updatedAt: nowIso,
      },
      updateMaskFields: ['adoConnection', 'updatedAt'],
    }),
  ]);

  return { ok: true };
});
