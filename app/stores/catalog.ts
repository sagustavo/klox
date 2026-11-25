import { generateRandomId } from '~/domain/ids';
import { tenantStorageKey } from '~/domain/auth';
import {
  PROJECT_COLOR_PALETTE,
  UNASSIGNED_PROJECT_ID,
  buildTaskTree,
  collectDescendantTaskIds,
  createUnassignedProject,
  flattenTaskTree,
  formatTaskHierarchyLabel,
  isValidHexColor,
  tagsForProject,
  validateProjectTagRename,
  validateTaskParent,
  type TagRenameErrorCode,
  type TaskTreeNode,
} from '~/domain/invariants';
import type { EntityId, Project, ProjectTag, Task, TaskStatus } from '~/domain/types';
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
      .sort((a, b) => a.name.localeCompare(b.name));
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
  }): Promise<void> {
    const target = projects.value.find((p) => p.id === params.projectId);
    if (!target) return;

    const updated: Project = {
      ...target,
      name: target.systemKey === 'unassigned' ? target.name : params.name.trim() || target.name,
      color: isValidHexColor(params.color) ? params.color.toUpperCase() : target.color,
      isBillableDefault: params.isBillableDefault,
    };

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

    const task: Task = {
      id: generateRandomId(),
      userId: params.uid,
      projectId: params.projectId,
      ...(params.parentTaskId ? { parentTaskId: params.parentTaskId } : {}),
      depth: parentCheck.depth,
      name: trimmed,
      ...(cleanDesc ? { description: cleanDesc } : {}),
      ...(params.targetHours && params.targetHours > 0 ? { targetHours: params.targetHours } : {}),
      ...(params.externalWorkItemId?.trim()
        ? {
            externalProvider: 'azure_devops',
            externalWorkItemId: params.externalWorkItemId.trim(),
          }
        : {}),
      completedWorkHours: 0,
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
      }
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
    updateTask,
    updateTaskStatus,
    deleteTask,
  };
});
