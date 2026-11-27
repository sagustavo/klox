import {
  loadUserAdoContext,
  patchAdoCompletedWork,
  resolveTargetOrgAndProject,
  type AdoPushItemResult,
} from '../../../utils/adoClient';

interface PushItemRequest {
  orgUrl?: string;
  project?: string;
  workItemId: number;
  approvedDeltaHours: number;
}

interface PushRequestBody {
  items: PushItemRequest[];
}

export default defineEventHandler(async (event) => {
  const { connection, pat } = await loadUserAdoContext(event);
  const body = await readBody<PushRequestBody>(event);

  if (!Array.isArray(body?.items) || body.items.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ADO_INVALID_INPUT',
      data: { code: 'ADO_INVALID_INPUT' },
    });
  }

  const results: Array<AdoPushItemResult & { orgUrl: string; project: string }> = [];

  for (const item of body.items) {
    const target = resolveTargetOrgAndProject(connection, item.orgUrl, item.project);
    const result = await patchAdoCompletedWork({
      orgUrl: target.orgUrl,
      pat,
      project: target.project,
      workItemId: item.workItemId,
      approvedDeltaHours: item.approvedDeltaHours,
    });
    results.push({
      ...result,
      orgUrl: target.orgUrl,
      project: target.project,
    });
  }

  return { results };
});
