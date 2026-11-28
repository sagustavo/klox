import {
  getProjectWorkItemTypes,
  listAdoProjects,
  loadUserAdoContext,
  resolveTargetOrgAndProject,
} from '../../../utils/adoClient';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const connectionId = typeof query.connectionId === 'string' ? query.connectionId : undefined;
  const kloxProjectId = typeof query.kloxProjectId === 'string' ? query.kloxProjectId : undefined;
  const rawOrg = typeof query.orgUrl === 'string' ? query.orgUrl : undefined;
  const rawProject = typeof query.project === 'string' ? query.project : undefined;

  const { connection, pat } = await loadUserAdoContext(event, {
    connectionId,
    kloxProjectId,
    orgUrl: rawOrg,
    project: rawProject,
  });

  const target = resolveTargetOrgAndProject(connection, rawOrg, rawProject);
  const [projects, workItemTypes] = await Promise.all([
    listAdoProjects({ orgUrl: target.orgUrl, pat }),
    getProjectWorkItemTypes({
      orgUrl: target.orgUrl,
      pat,
      project: target.project,
    }),
  ]);

  return {
    projects,
    workItemTypes,
  };
});
