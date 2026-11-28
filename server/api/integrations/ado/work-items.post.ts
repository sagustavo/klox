import {
  createAdoWorkItem,
  loadUserAdoContext,
  resolveTargetOrgAndProject,
} from '../../../utils/adoClient';

interface CreateWorkItemBody {
  connectionId?: string;
  kloxProjectId?: string;
  orgUrl?: string;
  project?: string;
  workItemType?: string;
  title: string;
  initialCompletedWork?: number;
}

export default defineEventHandler(async (event) => {
  const body = await readBody<CreateWorkItemBody>(event);
  const { connection, pat } = await loadUserAdoContext(event, {
    connectionId: body?.connectionId,
    kloxProjectId: body?.kloxProjectId,
    orgUrl: body?.orgUrl,
    project: body?.project,
  });
  const target = resolveTargetOrgAndProject(connection, body?.orgUrl, body?.project);

  const workItemType =
    (body?.workItemType ?? connection.defaultWorkItemType ?? 'Task').trim() || 'Task';

  const item = await createAdoWorkItem({
    orgUrl: target.orgUrl,
    pat,
    project: target.project,
    workItemType,
    title: body?.title ?? '',
    initialCompletedWork: body?.initialCompletedWork,
    completedWorkFieldRef: connection.completedWorkFieldRef,
  });

  return {
    orgUrl: target.orgUrl,
    project: target.project,
    item,
  };
});
