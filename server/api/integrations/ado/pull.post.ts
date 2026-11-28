import type { AdoWorkItemSummary } from '~/domain/ado';
import {
  getAdoWorkItemsByIds,
  loadUserAdoVault,
  resolveTargetOrgAndProject,
  resolveVaultConnectionAndPat,
} from '../../../utils/adoClient';

interface PullTargetGroup {
  connectionId?: string;
  kloxProjectId?: string;
  orgUrl?: string;
  project?: string;
  ids: number[];
}

interface PullRequestBody {
  targets: PullTargetGroup[];
}

export default defineEventHandler(async (event) => {
  const vault = await loadUserAdoVault(event);
  const body = await readBody<PullRequestBody>(event);

  if (!Array.isArray(body?.targets) || body.targets.length === 0) {
    return { items: [] };
  }

  const allItems: Array<AdoWorkItemSummary & { orgUrl: string; project: string }> = [];

  for (const group of body.targets) {
    if (!Array.isArray(group.ids) || group.ids.length === 0) continue;
    const { connection, pat } = resolveVaultConnectionAndPat({
      connections: vault.connections,
      tokens: vault.tokens,
      connectionId: group.connectionId,
      kloxProjectId: group.kloxProjectId,
      orgUrl: group.orgUrl,
      project: group.project,
    });
    const target = resolveTargetOrgAndProject(connection, group.orgUrl, group.project);
    const items = await getAdoWorkItemsByIds({
      orgUrl: target.orgUrl,
      pat,
      project: target.project,
      ids: group.ids,
      completedWorkFieldRef: connection.completedWorkFieldRef,
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
