import { normalizeAdoFieldRef, type AdoFieldOption } from '~/domain/ado';
import {
  getProjectWorkItemTypes,
  listAdoProjects,
  listProjectNumericFields,
  loadUserAdoContext,
  resolveTargetOrgAndProject,
} from '../../../utils/adoClient';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const connectionId = typeof query.connectionId === 'string' ? query.connectionId : undefined;
  const kloxProjectId = typeof query.kloxProjectId === 'string' ? query.kloxProjectId : undefined;
  const rawOrg = typeof query.orgUrl === 'string' ? query.orgUrl : undefined;
  const rawProject = typeof query.project === 'string' ? query.project : undefined;
  const rawField = typeof query.completedWorkFieldRef === 'string' ? query.completedWorkFieldRef : undefined;

  const { connection, pat } = await loadUserAdoContext(event, {
    connectionId,
    kloxProjectId,
    orgUrl: rawOrg,
    project: rawProject,
  });

  const fieldCheck = normalizeAdoFieldRef(rawField ?? connection.completedWorkFieldRef);
  const target = resolveTargetOrgAndProject(connection, rawOrg, rawProject);
  const safeFetchNumericFields = async (): Promise<AdoFieldOption[]> => {
    try {
      return await listProjectNumericFields({
        orgUrl: target.orgUrl,
        pat,
        project: target.project,
      });
    } catch {
      return [];
    }
  };

  const [projects, workItemTypes, numericFields] = await Promise.all([
    listAdoProjects({ orgUrl: target.orgUrl, pat }),
    getProjectWorkItemTypes({
      orgUrl: target.orgUrl,
      pat,
      project: target.project,
      completedWorkFieldRef: fieldCheck.valid ? fieldCheck.fieldRef : connection.completedWorkFieldRef,
    }),
    safeFetchNumericFields(),
  ]);

  return {
    projects,
    workItemTypes,
    numericFields,
  };
});
