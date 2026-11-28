import {
  loadUserAdoContext,
  resolveTargetOrgAndProject,
  searchAdoWorkItems,
} from '../../../utils/adoClient';

interface SearchRequestBody {
  connectionId?: string;
  kloxProjectId?: string;
  orgUrl?: string;
  project?: string;
  query?: string;
  top?: number;
}

export default defineEventHandler(async (event) => {
  const body = await readBody<SearchRequestBody>(event);
  const { connection, pat } = await loadUserAdoContext(event, {
    connectionId: body?.connectionId,
    kloxProjectId: body?.kloxProjectId,
    orgUrl: body?.orgUrl,
    project: body?.project,
  });
  const target = resolveTargetOrgAndProject(connection, body?.orgUrl, body?.project);

  const items = await searchAdoWorkItems({
    orgUrl: target.orgUrl,
    pat,
    project: target.project,
    queryText: body?.query ?? '',
    top: body?.top ?? 20,
  });

  return {
    orgUrl: target.orgUrl,
    project: target.project,
    items,
  };
});
