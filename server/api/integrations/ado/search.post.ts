import {
  loadUserAdoContext,
  resolveTargetOrgAndProject,
  searchAdoWorkItems,
} from '../../../utils/adoClient';

interface SearchRequestBody {
  orgUrl?: string;
  project?: string;
  query?: string;
  top?: number;
}

export default defineEventHandler(async (event) => {
  const { connection, pat } = await loadUserAdoContext(event);
  const body = await readBody<SearchRequestBody>(event);
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
