import { toDateKey } from '~/domain/duration';
import {
  listAdoIterations,
  loadUserAdoContext,
  resolveTargetOrgAndProject,
} from '../../../utils/adoClient';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const connectionId = typeof query.connectionId === 'string' ? query.connectionId : undefined;
  const kloxProjectId = typeof query.kloxProjectId === 'string' ? query.kloxProjectId : undefined;
  const rawProject = typeof query.project === 'string' ? query.project : undefined;
  const timeZone = typeof query.timeZone === 'string' && query.timeZone.trim()
    ? query.timeZone.trim()
    : 'UTC';

  const { connection, pat } = await loadUserAdoContext(event, {
    connectionId,
    kloxProjectId,
    project: rawProject,
  });
  const target = resolveTargetOrgAndProject(connection, undefined, rawProject);
  const todayDateKey = toDateKey(new Date(), timeZone);

  const data = await listAdoIterations({
    orgUrl: target.orgUrl,
    pat,
    project: target.project,
    todayDateKey,
  });

  return {
    orgUrl: target.orgUrl,
    project: target.project,
    ...data,
  };
});
