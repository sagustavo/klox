import { generateRandomId } from '~/domain/ids';
import {
  PROJECT_COLOR_PALETTE,
  UNASSIGNED_PROJECT_ID,
  createUnassignedProject,
  isValidHexColor,
  tagsForProject,
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

  function getTasksForProject(projectId: EntityId | null | undefined): Task[] {
    if (!projectId) return [];
    return tasks.value
      .filter((t) => t.projectId === projectId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function persistLocal() {
    if (import.meta.server) return;
    try {
      localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(projects.value));
      localStorage.setItem(STORAGE_TAGS_KEY, JSON.stringify(tags.value));
      localStorage.setItem(STORAGE_TASKS_KEY, JSON.stringify(tasks.value));
    } catch {
      // Ignore quota errors
    }
  }

  function loadLocal(uid: string) {
    if (import.meta.server) return;
    try {
      const rawProjects = localStorage.getItem(STORAGE_PROJECTS_KEY);
      const rawTags = localStorage.getItem(STORAGE_TAGS_KEY);
      const rawTasks = localStorage.getItem(STORAGE_TASKS_KEY);

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
    name: string;
    targetHours?: number;
    externalWorkItemId?: string;
  }): Promise<Task> {
    const trimmed = params.name.trim();
    if (!trimmed) throw new Error('Task name is required');

    const task: Task = {
      id: generateRandomId(),
      userId: params.uid,
      projectId: params.projectId,
      name: trimmed,
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
    tasks.value = tasks.value.filter((t) => t.id !== params.taskId);
    persistLocal();

    if (!params.isDemo) {
      const fb = await getFirebaseClient();
      if (fb) {
        const { deleteDoc, doc } = await import('firebase/firestore');
        await deleteDoc(doc(fb.db, 'users', params.uid, 'tasks', params.taskId));
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
    getProjectById,
    getTagsForProject,
    getTasksForProject,
    createProject,
    updateProject,
    deleteProject,
    createTag,
    deleteTag,
    createTask,
    updateTaskStatus,
    deleteTask,
  };
});
