import type { AdoWorkItemSummary } from '~/domain/ado';
import {
  getAdoWorkItemsByIds,
  loadUserAdoContext,
  resolveTargetOrgAndProject,
} from '../../../utils/adoClient';

interface PullTargetGroup {
  orgUrl?: string;
  project?: string;
  ids: number[];
}

interface PullRequestBody {
  targets: PullTargetGroup[];
}

export default defineEventHandler(async (event) => {
  const { connection, pat } = await loadUserAdoContext(event);
  const body = await readBody<PullRequestBody>(event);

  if (!Array.isArray(body?.targets) || body.targets.length === 0) {
    return { items: [] };
  }

  const allItems: Array<AdoWorkItemSummary & { orgUrl: string; project: string }> = [];

  for (const group of body.targets) {
    if (!Array.isArray(group.ids) || group.ids.length === 0) continue;
    const target = resolveTargetOrgAndProject(connection, group.orgUrl, group.project);
    const items = await getAdoWorkItemsByIds({
      orgUrl: target.orgUrl,
      pat,
      project: target.project,
      ids: group.ids,
    });
    for (const item of items) {
      allItems.push({
        ...item,
        orgUrl: target.orgUrl,
        project: target.project,
      });
    }
  }

  return { items: allItems };
});
