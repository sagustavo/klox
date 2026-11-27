import {
  createAdoWorkItem,
  loadUserAdoContext,
  resolveTargetOrgAndProject,
} from '../../../utils/adoClient';

interface CreateWorkItemBody {
  orgUrl?: string;
  project?: string;
  workItemType?: string;
  title: string;
  initialCompletedWork?: number;
}

export default defineEventHandler(async (event) => {
  const { connection, pat } = await loadUserAdoContext(event);
  const body = await readBody<CreateWorkItemBody>(event);
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
  });

  return {
    orgUrl: target.orgUrl,
    project: target.project,
    item,
  };
});
