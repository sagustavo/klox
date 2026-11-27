import {
  getProjectWorkItemTypes,
  listAdoProjects,
  loadUserAdoContext,
  resolveTargetOrgAndProject,
} from '../../../utils/adoClient';

export default defineEventHandler(async (event) => {
  const { connection, pat } = await loadUserAdoContext(event);
  const query = getQuery(event);

  const rawOrg = typeof query.orgUrl === 'string' ? query.orgUrl : undefined;
  const rawProject = typeof query.project === 'string' ? query.project : undefined;

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
