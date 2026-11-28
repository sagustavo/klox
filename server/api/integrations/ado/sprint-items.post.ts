import { toDateKey } from '~/domain/duration';
import {
  fetchAdoSprintAssignedHierarchy,
  listAdoIterations,
  loadUserAdoContext,
  resolveTargetOrgAndProject,
} from '../../../utils/adoClient';

interface SprintItemsRequestBody {
  connectionId?: string;
  kloxProjectId?: string;
  project?: string;
  iterationPath?: string;
  timeZone?: string;
}

export default defineEventHandler(async (event) => {
  const body = await readBody<SprintItemsRequestBody>(event);
  const { connection, pat } = await loadUserAdoContext(event, {
    connectionId: body?.connectionId,
    kloxProjectId: body?.kloxProjectId,
    project: body?.project,
  });
  const target = resolveTargetOrgAndProject(connection, undefined, body?.project);

  const safeTimeZone = body?.timeZone?.trim() || 'UTC';
  const todayDateKey = toDateKey(new Date(), safeTimeZone);

  const iterCatalog = await listAdoIterations({
    orgUrl: target.orgUrl,
    pat,
    project: target.project,
    todayDateKey,
  });

  const requestedPath = body?.iterationPath?.trim();
  const effectiveIterationPath =
    requestedPath || iterCatalog.currentIterationPath || target.project;
  const matchedIter = iterCatalog.iterations.find(
    (it) => it.iterationPath.toLowerCase() === effectiveIterationPath.toLowerCase()
  );

  const items = await fetchAdoSprintAssignedHierarchy({
    orgUrl: target.orgUrl,
    pat,
    project: target.project,
    iterationPath: effectiveIterationPath,
  });

  return {
    orgUrl: target.orgUrl,
    project: target.project,
    iterationPath: effectiveIterationPath,
    iterationName: matchedIter?.displayPath || matchedIter?.name || effectiveIterationPath,
    items,
  };
});
