import { generateRandomId } from '~/domain/ids';
import { tenantStorageKey } from '~/domain/auth';
import {
  PROJECT_COLOR_PALETTE,
  UNASSIGNED_PROJECT_ID,
  buildTaskTree,
  collectDescendantTaskIds,
  compareTasksByPriority,
  computeTaskSiblingReorder,
  createUnassignedProject,
  flattenTaskTree,
  formatTaskHierarchyLabel,
  isValidHexColor,
  nextTaskSortOrder,
  tagsForProject,
  validateProjectTagRename,
  validateTaskParent,
  type TagRenameErrorCode,
  type TaskTreeNode,
} from '~/domain/invariants';
import type {
  EntityId,
  Project,
  ProjectAdoConfig,
  ProjectTag,
  Task,
  TaskDepth,
  TaskStatus,
} from '~/domain/types';
import { getFirebaseClient } from '~/utils/firebaseClient';

const STORAGE_PROJECTS_KEY = 'klox_catalog_projects';
const STORAGE_TAGS_KEY = 'klox_catalog_tags';
const STORAGE_TASKS_KEY = 'klox_catalog_tasks';

export const useCatalogStore = defineStore('catalog', () => {
  const projects = ref<Project[]>([]);
  const tags = ref<ProjectTag[]>([]);
  const tasks = ref<Task[]>([]);
  const loadedUid = ref<string | null>(null);
  const activeUid = ref<string | null>(null);
  const loading = ref(false);

  const sortedProjects = computed(() => {
    return [...projects.value].sort((a, b) => {
      if (a.systemKey === 'unassigned') return -1;
      if (b.systemKey === 'unassigned') return 1;
      return a.name.localeCompare(b.name);
    });
  });

  function getProjectById(projectId: EntityId | null | undefined): Project | undefined {
    if (!projectId) return undefined;
    return projects.value.find((p) => p.id === projectId);
  }

  function getTagsForProject(projectId: EntityId | null | undefined): ProjectTag[] {
    return tagsForProject(tags.value, projectId).sort((a, b) => a.name.localeCompare(b.name));
  }

  function getTagById(tagId: EntityId | null | undefined): ProjectTag | undefined {
    if (!tagId) return undefined;
    return tags.value.find((t) => t.id === tagId);
  }

  function getTasksForProject(projectId: EntityId | null | undefined): Task[] {
    if (!projectId) return [];
    return tasks.value
      .filter((t) => t.projectId === projectId)
      .sort(compareTasksByPriority);
  }

  function getTaskById(taskId: EntityId | null | undefined): Task | undefined {
    if (!taskId) return undefined;
    return tasks.value.find((t) => t.id === taskId);
  }

  function getTaskTreeForProject(projectId: EntityId | null | undefined): TaskTreeNode[] {
    return buildTaskTree(tasks.value, projectId);
  }

  function getFlattenedTasksForProject(projectId: EntityId | null | undefined): TaskTreeNode[] {
    return flattenTaskTree(buildTaskTree(tasks.value, projectId));
  }

  function getTaskHierarchicalLabel(taskId: EntityId | null | undefined): string {
    const task = getTaskById(taskId);
    if (!task) return '';
    return formatTaskHierarchyLabel(task, tasks.value);
  }

  function persistLocal() {
    if (import.meta.server || !activeUid.value) return;
    try {
      const uid = activeUid.value;
      localStorage.setItem(tenantStorageKey(STORAGE_PROJECTS_KEY, uid), JSON.stringify(projects.value));
      localStorage.setItem(tenantStorageKey(STORAGE_TAGS_KEY, uid), JSON.stringify(tags.value));
      localStorage.setItem(tenantStorageKey(STORAGE_TASKS_KEY, uid), JSON.stringify(tasks.value));
    } catch {
      // Ignore quota errors
    }
  }

  function loadLocal(uid: string) {
    if (import.meta.server) return;
    try {
      let rawProjects = localStorage.getItem(tenantStorageKey(STORAGE_PROJECTS_KEY, uid));
      let rawTags = localStorage.getItem(tenantStorageKey(STORAGE_TAGS_KEY, uid));
      let rawTasks = localStorage.getItem(tenantStorageKey(STORAGE_TASKS_KEY, uid));

      if (rawProjects === null && uid === 'demo-user') {
        const legacyProjects = localStorage.getItem(STORAGE_PROJECTS_KEY);
        if (legacyProjects) {
          const parsedLegacy = JSON.parse(legacyProjects) as Project[];
          if (parsedLegacy.every((p) => p.userId === 'demo-user')) {
            rawProjects = legacyProjects;
            rawTags = localStorage.getItem(STORAGE_TAGS_KEY);
            rawTasks = localStorage.getItem(STORAGE_TASKS_KEY);
          }
        }
      }

      projects.value = rawProjects ? (JSON.parse(rawProjects) as Project[]) : [];
      tags.value = rawTags ? (JSON.parse(rawTags) as ProjectTag[]) : [];
      tasks.value = rawTasks ? (JSON.parse(rawTasks) as Task[]) : [];
    } catch {
      projects.value = [];
      tags.value = [];
      tasks.value = [];
    }

    ensureUnassignedLocal(uid);
  }

  function reset() {
    projects.value = [];
    tags.value = [];
    tasks.value = [];
    loadedUid.value = null;
    activeUid.value = null;
    loading.value = false;
  }

  function ensureUnassignedLocal(uid: string): Project {
    const existing = projects.value.find(
      (p) => p.systemKey === 'unassigned' || p.id === UNASSIGNED_PROJECT_ID
    );
    if (existing) return existing;
    const unassigned = createUnassignedProject(uid);
    projects.value = [unassigned, ...projects.value];
    persistLocal();
    return unassigned;
  }

  async function hydrate(uid: string, isDemo: boolean): Promise<void> {
    if (import.meta.server) return;
    if (loadedUid.value === uid && projects.value.length > 0) return;

    if (loadedUid.value !== uid) {
      projects.value = [];
      tags.value = [];
      tasks.value = [];
    }
    activeUid.value = uid;

    loading.value = true;
    try {
      loadLocal(uid);
      loadedUid.value = uid;

      if (isDemo) return;
      const fb = await getFirebaseClient();
      if (!fb) return;

      const { collection, doc, getDocs, setDoc } = await import('firebase/firestore');
      const [projSnap, tagSnap, taskSnap] = await Promise.all([
        getDocs(collection(fb.db, 'users', uid, 'projects')),
        getDocs(collection(fb.db, 'users', uid, 'tags')),
        getDocs(collection(fb.db, 'users', uid, 'tasks')),
      ]);

      const remoteProjects = projSnap.docs.map((d) => d.data() as Project);
      const remoteTags = tagSnap.docs.map((d) => d.data() as ProjectTag);
      const remoteTasks = taskSnap.docs.map((d) => d.data() as Task);

      if (!remoteProjects.some((p) => p.systemKey === 'unassigned')) {
        const unassigned = createUnassignedProject(uid);
        remoteProjects.unshift(unassigned);
        await setDoc(doc(fb.db, 'users', uid, 'projects', unassigned.id), unassigned);
      }

      projects.value = remoteProjects;
      tags.value = remoteTags;
      tasks.value = remoteTasks;
      persistLocal();
    } catch (err) {
      console.warn('[Klox catalog hydrate fallback to local]', err);
    } finally {
      loading.value = false;
    }
  }

  async function createProject(params: {
    uid: string;
    isDemo: boolean;
    name: string;
    color?: string;
    isBillableDefault?: boolean;
  }): Promise<Project> {
    const trimmed = params.name.trim();
    if (!trimmed) throw new Error('Project name is required');

    const existing = projects.value.find(
      (p) => p.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) return existing;

    const fallbackColor =
      PROJECT_COLOR_PALETTE[projects.value.length % PROJECT_COLOR_PALETTE.length] ?? '#3B82F6';
    const color =
      params.color && isValidHexColor(params.color) ? params.color.toUpperCase() : fallbackColor;

    const project: Project = {
      id: generateRandomId(),
      userId: params.uid,
      name: trimmed,
      color,
      isBillableDefault: Boolean(params.isBillableDefault),
      createdAt: new Date().toISOString(),
    };

    projects.value = [...projects.value, project];
    persistLocal();

    if (!params.isDemo) {
      const fb = await getFirebaseClient();
      if (fb) {
        const { doc, setDoc } = await import('firebase/firestore');
        await setDoc(doc(fb.db, 'users', params.uid, 'projects', project.id), project);
      }
    }

    return project;
  }

  /**
   * High-throughput bulk project creation for Toggl CSV imports:
   * deduplicates case-insensitively, updates reactive state & localStorage ONCE,
   * and commits to Firestore in 450-op `writeBatch` chunks.
   */
  async function createProjectsBatch(params: {
    uid: string;
    isDemo: boolean;
    items: ReadonlyArray<{ name: string; color?: string; isBillableDefault?: boolean }>;
  }): Promise<Project[]> {
    if (params.items.length === 0) return [];

    const byLower = new Map<string, Project>();
    for (const p of projects.value) {
      byLower.set(p.name.trim().toLowerCase(), p);
    }

    const nowIso = new Date().toISOString();
    const created: Project[] = [];

    for (const item of params.items) {
      const trimmed = item.name.trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      if (byLower.has(lower)) continue;

      const paletteIdx = (projects.value.length + created.length) % PROJECT_COLOR_PALETTE.length;
      const fallbackColor = PROJECT_COLOR_PALETTE[paletteIdx] ?? '#3B82F6';
      const color =
        item.color && isValidHexColor(item.color) ? item.color.toUpperCase() : fallbackColor;

      const project: Project = {
        id: generateRandomId(),
        userId: params.uid,
        name: trimmed,
        color,
        isBillableDefault: Boolean(item.isBillableDefault),
        createdAt: nowIso,
      };
      byLower.set(lower, project);
      created.push(project);
    }

    if (created.length === 0) return [];

    projects.value = [...projects.value, ...created];
    persistLocal();

    if (!params.isDemo) {
      const fb = await getFirebaseClient();
      if (fb) {
        const { doc, writeBatch } = await import('firebase/firestore');
        const BATCH_SIZE = 450;
        for (let i = 0; i < created.length; i += BATCH_SIZE) {
          const chunk = created.slice(i, i + BATCH_SIZE);
          const batch = writeBatch(fb.db);
          for (const project of chunk) {
            batch.set(doc(fb.db, 'users', params.uid, 'projects', project.id), project);
          }
          await batch.commit();
        }
      }
    }

    return created;
  }

  async function updateProject(params: {
    uid: string;
    isDemo: boolean;
    projectId: EntityId;
    name: string;
    color: string;
    isBillableDefault: boolean;
    adoConfig?: ProjectAdoConfig | null;
  }): Promise<void> {
    const target = projects.value.find((p) => p.id === params.projectId);
    if (!target) return;

    const updated: Project = {
      ...target,
      name: target.systemKey === 'unassigned' ? target.name : params.name.trim() || target.name,
      color: isValidHexColor(params.color) ? params.color.toUpperCase() : target.color,
      isBillableDefault: params.isBillableDefault,
    };

    if (params.adoConfig !== undefined) {
      if (params.adoConfig) {
        const cleanCfg: ProjectAdoConfig = {
          enabled: Boolean(params.adoConfig.enabled),
        };
        if (params.adoConfig.orgUrl?.trim()) cleanCfg.orgUrl = params.adoConfig.orgUrl.trim();
        if (params.adoConfig.project?.trim()) cleanCfg.project = params.adoConfig.project.trim();
        if (params.adoConfig.defaultWorkItemType?.trim()) {
          cleanCfg.defaultWorkItemType = params.adoConfig.defaultWorkItemType.trim();
        }
        updated.adoConfig = cleanCfg;
      } else {
        delete updated.adoConfig;
      }
    }

    projects.value = projects.value.map((p) => (p.id === updated.id ? updated : p));
    persistLocal();

    if (!params.isDemo) {
      const fb = await getFirebaseClient();
      if (fb) {
        const { doc, setDoc } = await import('firebase/firestore');
        await setDoc(doc(fb.db, 'users', params.uid, 'projects', updated.id), updated);
      }
    }
  }

  async function deleteProject(params: {
    uid: string;
    isDemo: boolean;
    projectId: EntityId;
  }): Promise<void> {
    const target = projects.value.find((p) => p.id === params.projectId);
    if (!target || target.systemKey === 'unassigned') return;

    const removedTagIds = tags.value.filter((t) => t.projectId === target.id).map((t) => t.id);
    const removedTaskIds = tasks.value.filter((t) => t.projectId === target.id).map((t) => t.id);

    projects.value = projects.value.filter((p) => p.id !== target.id);
    tags.value = tags.value.filter((t) => t.projectId !== target.id);
    tasks.value = tasks.value.filter((t) => t.projectId !== target.id);
    persistLocal();

    if (!params.isDemo) {
      const fb = await getFirebaseClient();
      if (fb) {
        const { doc, writeBatch } = await import('firebase/firestore');
        const batch = writeBatch(fb.db);
        batch.delete(doc(fb.db, 'users', params.uid, 'projects', target.id));
        for (const tagId of removedTagIds) {
          batch.delete(doc(fb.db, 'users', params.uid, 'tags', tagId));
        }
        for (const taskId of removedTaskIds) {
          batch.delete(doc(fb.db, 'users', params.uid, 'tasks', taskId));
        }
        await batch.commit();
      }
    }
  }

  async function createTag(params: {
    uid: string;
    isDemo: boolean;
    projectId: EntityId;
    name: string;
  }): Promise<ProjectTag> {
    const trimmed = params.name.trim();
    if (!trimmed) throw new Error('Tag name is required');

    const existing = tags.value.find(
      (t) =>
        t.projectId === params.projectId &&
        t.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) return existing;

    const tag: ProjectTag = {
      id: generateRandomId(),
      userId: params.uid,
      projectId: params.projectId,
      name: trimmed,
      createdAt: new Date().toISOString(),
    };

    tags.value = [...tags.value, tag];
    persistLocal();

    if (!params.isDemo) {
      const fb = await getFirebaseClient();
      if (fb) {
        const { doc, setDoc } = await import('firebase/firestore');
        await setDoc(doc(fb.db, 'users', params.uid, 'tags', tag.id), tag);
      }
    }

    return tag;
  }

  /**
   * High-throughput bulk tag creation for Toggl CSV imports:
   * deduplicates per project, updates reactive state & localStorage ONCE,
   * and commits to Firestore in 450-op `writeBatch` chunks.
   */
  async function createTagsBatch(params: {
    uid: string;
    isDemo: boolean;
    items: ReadonlyArray<{ projectId: EntityId; name: string }>;
  }): Promise<ProjectTag[]> {
    if (params.items.length === 0) return [];

    const byKey = new Map<string, ProjectTag>();
    for (const t of tags.value) {
      byKey.set(`${t.projectId}::${t.name.trim().toLowerCase()}`, t);
    }

    const nowIso = new Date().toISOString();
    const created: ProjectTag[] = [];

    for (const item of params.items) {
      const trimmed = item.name.trim();
      if (!trimmed) continue;
      const key = `${item.projectId}::${trimmed.toLowerCase()}`;
      if (byKey.has(key)) continue;

      const tag: ProjectTag = {
        id: generateRandomId(),
        userId: params.uid,
        projectId: item.projectId,
        name: trimmed,
        createdAt: nowIso,
      };
      byKey.set(key, tag);
      created.push(tag);
    }

    if (created.length === 0) return [];

    tags.value = [...tags.value, ...created];
    persistLocal();

    if (!params.isDemo) {
      const fb = await getFirebaseClient();
      if (fb) {
        const { doc, writeBatch } = await import('firebase/firestore');
        const BATCH_SIZE = 450;
        for (let i = 0; i < created.length; i += BATCH_SIZE) {
          const chunk = created.slice(i, i + BATCH_SIZE);
          const batch = writeBatch(fb.db);
          for (const tag of chunk) {
            batch.set(doc(fb.db, 'users', params.uid, 'tags', tag.id), tag);
          }
          await batch.commit();
        }
      }
    }

    return created;
  }

  async function renameTag(params: {
    uid: string;
    isDemo: boolean;
    tagId: EntityId;
    name: string;
  }): Promise<{ ok: boolean; tag?: ProjectTag; error?: TagRenameErrorCode }> {
    const check = validateProjectTagRename({
      tagId: params.tagId,
      nextName: params.name,
      allTags: tags.value,
    });
    if (!check.valid) {
      return { ok: false, error: check.error };
    }

    const existing = tags.value.find((t) => t.id === params.tagId);
    if (!existing) {
      return { ok: false, error: 'TAG_NOT_FOUND' };
    }

    const updated: ProjectTag = {
      ...existing,
      name: check.normalizedName,
    };

    tags.value = tags.value.map((t) => (t.id === updated.id ? updated : t));
    persistLocal();

    if (!params.isDemo) {
      const fb = await getFirebaseClient();
      if (fb) {
        const { doc, setDoc } = await import('firebase/firestore');
        await setDoc(doc(fb.db, 'users', params.uid, 'tags', updated.id), updated);
      }
    }

    return { ok: true, tag: updated };
  }

  async function deleteTag(params: {
    uid: string;
    isDemo: boolean;
    tagId: EntityId;
  }): Promise<void> {
    tags.value = tags.value.filter((t) => t.id !== params.tagId);
    persistLocal();

    if (!params.isDemo) {
      const fb = await getFirebaseClient();
      if (fb) {
        const { deleteDoc, doc } = await import('firebase/firestore');
        await deleteDoc(doc(fb.db, 'users', params.uid, 'tags', params.tagId));
      }
    }
  }

  async function createTask(params: {
    uid: string;
    isDemo: boolean;
    projectId: EntityId;
    parentTaskId?: EntityId | null;
    name: string;
    description?: string;
    targetHours?: number;
    externalWorkItemId?: string;
    externalWorkItemTitle?: string;
    externalWorkItemType?: string;
    externalWorkItemUrl?: string;
    externalOrgUrl?: string;
    externalProject?: string;
    completedWorkHours?: number;
    externalSyncedAt?: string;
  }): Promise<Task> {
    const trimmed = params.name.trim();
    if (!trimmed) throw new Error('Task name is required');

    const parentCheck = validateTaskParent({
      projectId: params.projectId,
      parentTaskId: params.parentTaskId ?? null,
      allTasks: tasks.value,
    });
    if (!parentCheck.valid) {
      throw new Error(parentCheck.error ?? 'Invalid parent task');
    }

    const cleanDesc = params.description?.trim().slice(0, 4000);
    const normalizedParentId = params.parentTaskId ?? null;
    const siblings = tasks.value.filter(
      (t) => t.projectId === params.projectId && (t.parentTaskId ?? null) === normalizedParentId
    );
    const hasAdoLink = Boolean(params.externalWorkItemId?.trim());

    const task: Task = {
      id: generateRandomId(),
      userId: params.uid,
      projectId: params.projectId,
      ...(normalizedParentId ? { parentTaskId: normalizedParentId } : {}),
      depth: parentCheck.depth,
      sortOrder: nextTaskSortOrder(siblings),
      name: trimmed,
      ...(cleanDesc ? { description: cleanDesc } : {}),
      ...(params.targetHours && params.targetHours > 0 ? { targetHours: params.targetHours } : {}),
      ...(hasAdoLink
        ? {
            externalProvider: 'azure_devops',
            externalWorkItemId: params.externalWorkItemId!.trim(),
            ...(params.externalWorkItemTitle?.trim()
              ? { externalWorkItemTitle: params.externalWorkItemTitle.trim().slice(0, 300) }
              : {}),
            ...(params.externalWorkItemType?.trim()
              ? { externalWorkItemType: params.externalWorkItemType.trim().slice(0, 80) }
              : {}),
            ...(params.externalWorkItemUrl?.trim()
              ? { externalWorkItemUrl: params.externalWorkItemUrl.trim().slice(0, 512) }
              : {}),
            ...(params.externalOrgUrl?.trim()
              ? { externalOrgUrl: params.externalOrgUrl.trim().slice(0, 200) }
              : {}),
            ...(params.externalProject?.trim()
              ? { externalProject: params.externalProject.trim().slice(0, 128) }
              : {}),
            ...(params.externalSyncedAt?.trim()
              ? { externalSyncedAt: params.externalSyncedAt.trim().slice(0, 64) }
              : {}),
          }
        : {}),
      completedWorkHours:
        typeof params.completedWorkHours === 'number' && Number.isFinite(params.completedWorkHours)
          ? Math.max(0, params.completedWorkHours)
          : 0,
      status: 'todo',
      createdAt: new Date().toISOString(),
    };

    tasks.value = [...tasks.value, task];
    persistLocal();

    if (!params.isDemo) {
      const fb = await getFirebaseClient();
      if (fb) {
        const { doc, setDoc } = await import('firebase/firestore');
        await setDoc(doc(fb.db, 'users', params.uid, 'tasks', task.id), task);
      }
    }

    return task;
  }

  async function updateTask(params: {
    uid: string;
    isDemo: boolean;
    taskId: EntityId;
    name: string;
    description?: string;
    targetHours?: number | null;
    externalWorkItemId?: string | null;
    externalWorkItemTitle?: string | null;
    externalWorkItemType?: string | null;
    externalWorkItemUrl?: string | null;
    externalOrgUrl?: string | null;
    externalProject?: string | null;
    completedWorkHours?: number;
    externalSyncedAt?: string | null;
  }): Promise<void> {
    const target = tasks.value.find((t) => t.id === params.taskId);
    if (!target) return;

    const cleanDesc = params.description?.trim().slice(0, 4000);
    const updated: Task = {
      ...target,
      name: params.name.trim() || target.name,
    };

    if (cleanDesc) {
      updated.description = cleanDesc;
    } else {
      delete updated.description;
    }

    if (params.targetHours !== undefined) {
      if (params.targetHours && params.targetHours > 0) {
        updated.targetHours = params.targetHours;
      } else {
        delete updated.targetHours;
      }
    }

    if (params.externalWorkItemId !== undefined) {
      if (params.externalWorkItemId?.trim()) {
        updated.externalProvider = 'azure_devops';
        updated.externalWorkItemId = params.externalWorkItemId.trim();
      } else {
        delete updated.externalProvider;
        delete updated.externalWorkItemId;
        delete updated.externalWorkItemTitle;
        delete updated.externalWorkItemType;
        delete updated.externalWorkItemUrl;
        delete updated.externalOrgUrl;
        delete updated.externalProject;
        delete updated.externalSyncedAt;
      }
    }

    const assignOptionalString = (
      field:
        | 'externalWorkItemTitle'
        | 'externalWorkItemType'
        | 'externalWorkItemUrl'
        | 'externalOrgUrl'
        | 'externalProject'
        | 'externalSyncedAt',
      value: string | null | undefined,
      maxLen: number
    ) => {
      if (value === undefined) return;
      const trimmed = value?.trim().slice(0, maxLen);
      if (trimmed) {
        updated[field] = trimmed;
      } else {
        delete updated[field];
      }
    };

    if (updated.externalProvider === 'azure_devops') {
      assignOptionalString('externalWorkItemTitle', params.externalWorkItemTitle, 300);
      assignOptionalString('externalWorkItemType', params.externalWorkItemType, 80);
      assignOptionalString('externalWorkItemUrl', params.externalWorkItemUrl, 512);
      assignOptionalString('externalOrgUrl', params.externalOrgUrl, 200);
      assignOptionalString('externalProject', params.externalProject, 128);
      assignOptionalString('externalSyncedAt', params.externalSyncedAt, 64);
    }

    if (typeof params.completedWorkHours === 'number' && Number.isFinite(params.completedWorkHours)) {
      updated.completedWorkHours = Math.max(0, params.completedWorkHours);
    }

    tasks.value = tasks.value.map((t) => (t.id === updated.id ? updated : t));
    persistLocal();

    if (!params.isDemo) {
      const fb = await getFirebaseClient();
      if (fb) {
        const { doc, setDoc } = await import('firebase/firestore');
        await setDoc(doc(fb.db, 'users', params.uid, 'tasks', updated.id), updated);
      }
    }
  }

  /**
   * Persists sibling drag-and-drop or keyboard priority reordering within the same `(projectId, parentTaskId)`.
   */
  async function reorderTaskSiblings(params: {
    uid: string;
    isDemo: boolean;
    taskId: EntityId;
    targetIndex: number;
  }): Promise<boolean> {
    const target = tasks.value.find((t) => t.id === params.taskId);
    if (!target) return false;

    const parentKey = target.parentTaskId ?? null;
    const siblings = tasks.value.filter(
      (t) => t.projectId === target.projectId && (t.parentTaskId ?? null) === parentKey
    );
    const changes = computeTaskSiblingReorder({
      siblings,
      movedTaskId: target.id,
      targetIndex: params.targetIndex,
    });
    if (changes.length === 0) return false;

    const orderById = new Map(changes.map((c) => [c.taskId, c.sortOrder]));
    const changedTasks: Task[] = [];
    tasks.value = tasks.value.map((t) => {
      const nextOrder = orderById.get(t.id);
      if (nextOrder === undefined) return t;
      const updated: Task = { ...t, sortOrder: nextOrder };
      changedTasks.push(updated);
      return updated;
    });
    persistLocal();

    if (!params.isDemo && changedTasks.length > 0) {
      const fb = await getFirebaseClient();
      if (fb) {
        if (changedTasks.length === 1) {
          const { doc, setDoc } = await import('firebase/firestore');
          const single = changedTasks[0]!;
          await setDoc(doc(fb.db, 'users', params.uid, 'tasks', single.id), single);
        } else {
          const { doc, writeBatch } = await import('firebase/firestore');
          const BATCH_SIZE = 450;
          for (let i = 0; i < changedTasks.length; i += BATCH_SIZE) {
            const chunk = changedTasks.slice(i, i + BATCH_SIZE);
            const batch = writeBatch(fb.db);
            for (const item of chunk) {
              batch.set(doc(fb.db, 'users', params.uid, 'tasks', item.id), item);
            }
            await batch.commit();
          }
        }
      }
    }

    return true;
  }

  /**
   * Batch-updates read-only Azure DevOps Title and CompletedWork snapshots on linked Klox Tasks.
   */
  async function applyTasksAdoSnapshotBatch(params: {
    uid: string;
    isDemo: boolean;
    patches: ReadonlyArray<{
      taskId: EntityId;
      externalWorkItemTitle?: string;
      externalWorkItemType?: string;
      externalWorkItemUrl?: string;
      externalOrgUrl?: string;
      externalProject?: string;
      completedWorkHours?: number;
      externalSyncedAt?: string;
    }>;
  }): Promise<void> {
    if (params.patches.length === 0) return;

    const patchById = new Map(params.patches.map((p) => [p.taskId, p]));
    const updatedTasks: Task[] = [];

    tasks.value = tasks.value.map((t) => {
      const p = patchById.get(t.id);
      if (!p) return t;
      const next: Task = { ...t };
      if (p.externalWorkItemTitle !== undefined) {
        const clean = p.externalWorkItemTitle.trim().slice(0, 300);
        if (clean) next.externalWorkItemTitle = clean;
      }
      if (p.externalWorkItemType !== undefined) {
        const clean = p.externalWorkItemType.trim().slice(0, 80);
        if (clean) next.externalWorkItemType = clean;
      }
      if (p.externalWorkItemUrl !== undefined) {
        const clean = p.externalWorkItemUrl.trim().slice(0, 512);
        if (clean) next.externalWorkItemUrl = clean;
      }
      if (p.externalOrgUrl !== undefined) {
        const clean = p.externalOrgUrl.trim().slice(0, 200);
        if (clean) next.externalOrgUrl = clean;
      }
      if (p.externalProject !== undefined) {
        const clean = p.externalProject.trim().slice(0, 128);
        if (clean) next.externalProject = clean;
      }
      if (p.externalSyncedAt !== undefined) {
        const clean = p.externalSyncedAt.trim().slice(0, 64);
        if (clean) next.externalSyncedAt = clean;
      }
      if (typeof p.completedWorkHours === 'number' && Number.isFinite(p.completedWorkHours)) {
        next.completedWorkHours = Math.max(0, p.completedWorkHours);
      }
      updatedTasks.push(next);
      return next;
    });

    if (updatedTasks.length === 0) return;
    persistLocal();

    if (!params.isDemo) {
      const fb = await getFirebaseClient();
      if (fb) {
        const { doc, writeBatch } = await import('firebase/firestore');
        const BATCH_SIZE = 450;
        for (let i = 0; i < updatedTasks.length; i += BATCH_SIZE) {
          const chunk = updatedTasks.slice(i, i + BATCH_SIZE);
          const batch = writeBatch(fb.db);
          for (const item of chunk) {
            batch.set(doc(fb.db, 'users', params.uid, 'tasks', item.id), item);
          }
          await batch.commit();
        }
      }
    }
  }

  async function updateTaskStatus(params: {
    uid: string;
    isDemo: boolean;
    taskId: EntityId;
    status: TaskStatus;
  }): Promise<void> {
    const target = tasks.value.find((t) => t.id === params.taskId);
    if (!target) return;
    const updated: Task = { ...target, status: params.status };
    tasks.value = tasks.value.map((t) => (t.id === updated.id ? updated : t));
    persistLocal();

    if (!params.isDemo) {
      const fb = await getFirebaseClient();
      if (fb) {
        const { doc, setDoc } = await import('firebase/firestore');
        await setDoc(doc(fb.db, 'users', params.uid, 'tasks', updated.id), updated);
      }
    }
  }

  async function deleteTask(params: {
    uid: string;
    isDemo: boolean;
    taskId: EntityId;
  }): Promise<void> {
    const idsToDelete = collectDescendantTaskIds(params.taskId, tasks.value);
    const deleteSet = new Set(idsToDelete);
    tasks.value = tasks.value.filter((t) => !deleteSet.has(t.id));
    persistLocal();

    if (!params.isDemo) {
      const fb = await getFirebaseClient();
      if (fb) {
        const { doc, writeBatch } = await import('firebase/firestore');
        const batch = writeBatch(fb.db);
        for (const id of idsToDelete) {
          batch.delete(doc(fb.db, 'users', params.uid, 'tasks', id));
        }
        await batch.commit();
      }
    }
  }

  /**
   * Bulk task creation for Toggl CSV backup restoration and imports.
   * Splits `"Task / Subtask / Sub-subtask"` hierarchy paths up to 3 levels, creating
   * parents before children and committing to Firestore in 450-op `writeBatch` chunks.
   */
  async function createTasksBatch(params: {
    uid: string;
    isDemo: boolean;
    items: ReadonlyArray<{ projectId: EntityId; taskPath: string }>;
  }): Promise<Task[]> {
    if (params.items.length === 0) return [];

    const byKey = new Map<string, Task>();
    for (const existing of tasks.value) {
      const parentKey = existing.parentTaskId ?? '';
      byKey.set(
        `${existing.projectId}::${parentKey}::${existing.name.trim().toLowerCase()}`,
        existing
      );
    }

    const nowIso = new Date().toISOString();
    const created: Task[] = [];

    for (const item of params.items) {
      const segments = item.taskPath
        .split(/\s+\/\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3);
      if (segments.length === 0) continue;

      let parentId: EntityId | undefined;
      for (let depth = 0; depth < segments.length; depth++) {
        const segmentName = segments[depth]!.slice(0, 200);
        const key = `${item.projectId}::${parentId ?? ''}::${segmentName.toLowerCase()}`;
        const existing = byKey.get(key);
        if (existing) {
          parentId = existing.id;
          continue;
        }

        const task: Task = {
          id: generateRandomId(),
          userId: params.uid,
          projectId: item.projectId,
          ...(parentId ? { parentTaskId: parentId } : {}),
          depth: depth as TaskDepth,
          sortOrder: nextTaskSortOrder(
            [...tasks.value, ...created].filter(
              (t) => t.projectId === item.projectId && (t.parentTaskId ?? null) === (parentId ?? null)
            )
          ),
          name: segmentName,
          completedWorkHours: 0,
          status: 'todo',
          createdAt: nowIso,
        };
        byKey.set(key, task);
        created.push(task);
        parentId = task.id;
      }
    }

    if (created.length === 0) return [];

    tasks.value = [...tasks.value, ...created];
    persistLocal();

    if (!params.isDemo) {
      const fb = await getFirebaseClient();
      if (fb) {
        const { doc, writeBatch } = await import('firebase/firestore');
        const BATCH_SIZE = 450;
        for (let i = 0; i < created.length; i += BATCH_SIZE) {
          const chunk = created.slice(i, i + BATCH_SIZE);
          const batch = writeBatch(fb.db);
          for (const task of chunk) {
            batch.set(doc(fb.db, 'users', params.uid, 'tasks', task.id), task);
          }
          await batch.commit();
        }
      }
    }

    return created;
  }

  /**
   * Authoritative uncached read of Projects, Tags, and Tasks for pre-wipe backup.
   */
  async function fetchAllRemoteCatalog(uid: string): Promise<{
    projects: Project[];
    tags: ProjectTag[];
    tasks: Task[];
  }> {
    const fb = await getFirebaseClient();
    if (!fb) {
      return {
        projects: [...projects.value],
        tags: [...tags.value],
        tasks: [...tasks.value],
      };
    }

    const { collection, doc, getDocs, setDoc } = await import('firebase/firestore');
    const [projSnap, tagSnap, taskSnap] = await Promise.all([
      getDocs(collection(fb.db, 'users', uid, 'projects')),
      getDocs(collection(fb.db, 'users', uid, 'tags')),
      getDocs(collection(fb.db, 'users', uid, 'tasks')),
    ]);

    const remoteProjects = projSnap.docs.map((d) => d.data() as Project);
    const remoteTags = tagSnap.docs.map((d) => d.data() as ProjectTag);
    const remoteTasks = taskSnap.docs.map((d) => d.data() as Task);

    if (!remoteProjects.some((p) => p.systemKey === 'unassigned')) {
      const unassigned = createUnassignedProject(uid);
      remoteProjects.unshift(unassigned);
      await setDoc(doc(fb.db, 'users', uid, 'projects', unassigned.id), unassigned);
    }

    projects.value = remoteProjects;
    tags.value = remoteTags;
    tasks.value = remoteTasks;
    activeUid.value = uid;
    loadedUid.value = uid;
    persistLocal();

    return {
      projects: remoteProjects,
      tags: remoteTags,
      tasks: remoteTasks,
    };
  }

  /**
   * Deletes all Tasks, ProjectTags, and Projects (both remote Firestore and local state),
   * then immediately re-provisions the system `General / Unassigned` project invariant.
   */
  async function wipeAllData(params: {
    uid: string;
    isDemo: boolean;
  }): Promise<{ deletedProjects: number; deletedTags: number; deletedTasks: number }> {
    let deletedProjects = projects.value.filter(
      (p) => p.systemKey !== 'unassigned' && p.id !== UNASSIGNED_PROJECT_ID
    ).length;
    let deletedTags = tags.value.length;
    let deletedTasks = tasks.value.length;

    if (!params.isDemo) {
      const fb = await getFirebaseClient();
      if (fb) {
        const { collection, doc, getDocs, setDoc, writeBatch } = await import(
          'firebase/firestore'
        );
        const [taskSnap, tagSnap, projSnap] = await Promise.all([
          getDocs(collection(fb.db, 'users', params.uid, 'tasks')),
          getDocs(collection(fb.db, 'users', params.uid, 'tags')),
          getDocs(collection(fb.db, 'users', params.uid, 'projects')),
        ]);

        deletedTasks = taskSnap.docs.length;
        deletedTags = tagSnap.docs.length;
        deletedProjects = projSnap.docs.filter((d) => {
          const data = d.data() as Partial<Project>;
          return data.systemKey !== 'unassigned' && d.id !== UNASSIGNED_PROJECT_ID;
        }).length;

        const refsToDelete = [
          ...taskSnap.docs.map((d) => d.ref),
          ...tagSnap.docs.map((d) => d.ref),
          ...projSnap.docs.map((d) => d.ref),
        ];

        const BATCH_SIZE = 450;
        for (let i = 0; i < refsToDelete.length; i += BATCH_SIZE) {
          const chunk = refsToDelete.slice(i, i + BATCH_SIZE);
          const batch = writeBatch(fb.db);
          for (const ref of chunk) {
            batch.delete(ref);
          }
          await batch.commit();
        }

        const unassigned = createUnassignedProject(params.uid);
        await setDoc(doc(fb.db, 'users', params.uid, 'projects', unassigned.id), unassigned);
        projects.value = [unassigned];
      } else {
        projects.value = [createUnassignedProject(params.uid)];
      }
    } else {
      projects.value = [createUnassignedProject(params.uid)];
    }

    tags.value = [];
    tasks.value = [];
    activeUid.value = params.uid;
    loadedUid.value = params.uid;
    persistLocal();

    return {
      deletedProjects,
      deletedTags,
      deletedTasks,
    };
  }

  return {
    projects,
    tags,
    tasks,
    sortedProjects,
    loading,
    hydrate,
    reset,
    getProjectById,
    getTagsForProject,
    getTagById,
    getTasksForProject,
    getTaskById,
    getTaskTreeForProject,
    getFlattenedTasksForProject,
    getTaskHierarchicalLabel,
    createProject,
    createProjectsBatch,
    updateProject,
    deleteProject,
    createTag,
    createTagsBatch,
    renameTag,
    deleteTag,
    createTask,
    createTasksBatch,
    updateTask,
    updateTaskStatus,
    reorderTaskSiblings,
    applyTasksAdoSnapshotBatch,
    deleteTask,
    fetchAllRemoteCatalog,
    wipeAllData,
  };
});
