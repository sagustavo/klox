<script setup lang="ts">
import { Check, ExternalLink, GitBranch, Pencil, Plus, Tag, Trash2, X } from 'lucide-vue-next';
import {
  PROJECT_COLOR_PALETTE,
  UNASSIGNED_PROJECT_ID,
} from '~/domain/invariants';
import type { EntityId, Project, ProjectTag } from '~/domain/types';
import { useAdoStore } from '~/stores/ado';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const { t } = useI18n();
const localePath = useLocalePath();
const authStore = useAuthStore();
const catalogStore = useCatalogStore();
const adoStore = useAdoStore();

const selectedProjectId = ref<EntityId>(UNASSIGNED_PROJECT_ID);

// New Project form state
const newProjectName = ref('');
const newProjectColor = ref<string>(PROJECT_COLOR_PALETTE[0] ?? '#3B82F6');
const newProjectBillable = ref(true);

// Selected Project edit state
const editName = ref('');
const editColor = ref('#3B82F6');
const editBillable = ref(false);

// Project-bound Azure DevOps connection lookup
const boundAdoConnection = computed(() =>
  adoStore.getConnectionForProject(selectedProjectId.value)
);
const projectSavedFlash = ref(false);
let savedFlashTimer: ReturnType<typeof setTimeout> | null = null;

// New Tag & Inline Tag Rename state
const newTagName = ref('');
const editingTagId = ref<EntityId | null>(null);
const editingTagName = ref('');
const tagRenameError = ref<string | null>(null);
const tagRenameInputRef = ref<HTMLInputElement | HTMLInputElement[] | null>(null);

// Standardized Delete Confirmation state
type PendingProjectDelete =
  | { kind: 'project'; project: Project; tagCount: number; taskCount: number }
  | { kind: 'tag'; tag: ProjectTag };

const pendingDelete = ref<PendingProjectDelete | null>(null);
const isDeleting = ref(false);

onMounted(async () => {
  if (!authStore.user) return;
  await Promise.all([
    catalogStore.hydrate(authStore.user.uid, authStore.isDemoMode),
    adoStore.hydrate(authStore.user.uid, authStore.isDemoMode),
  ]);
  const first = catalogStore.sortedProjects[0];
  if (first) {
    selectProject(first);
  }
});

onBeforeUnmount(() => {
  if (savedFlashTimer) clearTimeout(savedFlashTimer);
});

const selectedProject = computed(() =>
  catalogStore.getProjectById(selectedProjectId.value)
);

const scopedTags = computed(() =>
  catalogStore.getTagsForProject(selectedProjectId.value)
);

function taskCountForProject(projectId: EntityId): number {
  return catalogStore.getTasksForProject(projectId).length;
}

function displayProjectName(project: Project): string {
  return project.systemKey === 'unassigned' ? t('catalog.unassigned') : project.name;
}

function selectProject(project: Project) {
  selectedProjectId.value = project.id;
  editName.value = project.name;
  editColor.value = project.color;
  editBillable.value = project.isBillableDefault;
  cancelEditTag();
}

async function handleCreateProject() {
  if (!authStore.user || !newProjectName.value.trim()) return;
  const created = await catalogStore.createProject({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    name: newProjectName.value,
    color: newProjectColor.value,
    isBillableDefault: newProjectBillable.value,
  });
  newProjectName.value = '';
  const nextColor =
    PROJECT_COLOR_PALETTE[catalogStore.projects.length % PROJECT_COLOR_PALETTE.length];
  if (nextColor) newProjectColor.value = nextColor;
  selectProject(created);
}

async function handleUpdateSelectedProject() {
  if (!authStore.user || !selectedProject.value) return;

  await catalogStore.updateProject({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    projectId: selectedProject.value.id,
    name: editName.value,
    color: editColor.value,
    isBillableDefault: editBillable.value,
  });

  projectSavedFlash.value = true;
  if (savedFlashTimer) clearTimeout(savedFlashTimer);
  savedFlashTimer = setTimeout(() => {
    projectSavedFlash.value = false;
  }, 1800);
}

function requestDeleteSelectedProject() {
  if (!authStore.user || !selectedProject.value) return;
  if (selectedProject.value.systemKey === 'unassigned') return;
  pendingDelete.value = {
    kind: 'project',
    project: selectedProject.value,
    tagCount: scopedTags.value.length,
    taskCount: taskCountForProject(selectedProject.value.id),
  };
}

async function handleCreateTag() {
  if (!authStore.user || !selectedProject.value || !newTagName.value.trim()) return;
  await catalogStore.createTag({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    projectId: selectedProject.value.id,
    name: newTagName.value,
  });
  newTagName.value = '';
}

function startEditTag(tag: ProjectTag) {
  editingTagId.value = tag.id;
  editingTagName.value = tag.name;
  tagRenameError.value = null;
  nextTick(() => {
    const rawRef = tagRenameInputRef.value;
    const inputEl = Array.isArray(rawRef) ? rawRef[0] : rawRef;
    inputEl?.focus();
    inputEl?.select();
  });
}

function cancelEditTag() {
  editingTagId.value = null;
  editingTagName.value = '';
  tagRenameError.value = null;
}

async function saveEditTag(tagId: EntityId) {
  if (!authStore.user) return;
  const result = await catalogStore.renameTag({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    tagId,
    name: editingTagName.value,
  });
  if (!result.ok) {
    tagRenameError.value = result.error ?? 'TAG_NAME_EMPTY';
    return;
  }
  cancelEditTag();
}

function requestDeleteTag(tag: ProjectTag) {
  pendingDelete.value = { kind: 'tag', tag };
}

const confirmDialogTitle = computed(() => {
  const target = pendingDelete.value;
  if (!target) return '';
  return target.kind === 'project' ? t('confirm.deleteProjectTitle') : t('confirm.deleteTagTitle');
});

const confirmDialogDescription = computed(() => {
  const target = pendingDelete.value;
  if (!target) return '';
  if (target.kind === 'project') {
    return t('confirm.deleteProjectDesc', {
      name: target.project.name,
      tagCount: target.tagCount,
      taskCount: target.taskCount,
    });
  }
  return t('confirm.deleteTagDesc', { name: target.tag.name });
});

const confirmDialogDetail = computed(() => {
  const target = pendingDelete.value;
  if (!target) return undefined;
  return target.kind === 'project' ? target.project.name : target.tag.name;
});

async function confirmDelete() {
  if (!authStore.user || !pendingDelete.value || isDeleting.value) return;
  isDeleting.value = true;
  try {
    const target = pendingDelete.value;
    if (target.kind === 'project') {
      const boundConn = adoStore.getConnectionForProject(target.project.id);
      await catalogStore.deleteProject({
        uid: authStore.user.uid,
        isDemo: authStore.isDemoMode,
        projectId: target.project.id,
      });
      if (boundConn) {
        await adoStore.disconnectConnection({
          uid: authStore.user.uid,
          isDemo: authStore.isDemoMode,
          connectionId: boundConn.id,
        });
      }
      const fallback = catalogStore.sortedProjects[0];
      if (fallback) selectProject(fallback);
    } else {
      if (editingTagId.value === target.tag.id) cancelEditTag();
      await catalogStore.deleteTag({
        uid: authStore.user.uid,
        isDemo: authStore.isDemoMode,
        tagId: target.tag.id,
      });
    }
    pendingDelete.value = null;
  } finally {
    isDeleting.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="relative overflow-hidden border border-border-hairline bg-bg-elevated p-5 sm:p-6">
      <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="display-wide text-xl sm:text-2xl text-text-primary">
            {{ $t('projects.title') }}
          </h1>
          <p class="mt-1.5 text-sm text-text-muted">
            {{ $t('projects.subtitle') }}
          </p>
        </div>

        <NuxtLink
          :to="localePath('/app/tasks')"
          class="btn-press inline-flex h-9 items-center gap-2 border border-border-hairline bg-bg-primary px-3.5 text-xs font-medium text-text-primary hover:border-signal transition-colors"
        >
          <span>{{ $t('projects.goToTasks') }}</span>
          <ExternalLink class="h-3.5 w-3.5 text-signal" aria-hidden="true" />
        </NuxtLink>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <!-- Left Column: Projects List + Create Project Form -->
      <div class="lg:col-span-5 space-y-4">
        <div class="relative overflow-hidden border border-border-hairline bg-bg-elevated p-5">
          <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
          <div class="label-eyebrow border-b border-border-hairline pb-3 text-signal">
            {{ $t('catalog.projectsTitle') }} ({{ catalogStore.sortedProjects.length }})
          </div>

          <form class="mt-4 space-y-3 border-b border-border-hairline pb-4" @submit.prevent="handleCreateProject">
            <input
              v-model="newProjectName"
              type="text"
              required
              :placeholder="$t('catalog.newProjectPlaceholder')"
              class="h-10 w-full border border-border-input bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
            />

            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-1.5">
                <input
                  v-model="newProjectColor"
                  type="color"
                  :aria-label="$t('catalog.colorLabel')"
                  class="h-8 w-8 cursor-pointer border border-border-input bg-bg-primary p-0.5"
                />
                <button
                  v-for="swatch in PROJECT_COLOR_PALETTE"
                  :key="swatch"
                  type="button"
                  class="h-6 w-6 border transition-transform"
                  :class="
                    newProjectColor.toUpperCase() === swatch
                      ? 'border-text-primary scale-110'
                      : 'border-border-hairline opacity-75 hover:opacity-100'
                  "
                  :style="{ backgroundColor: swatch }"
                  @click="newProjectColor = swatch"
                />
              </div>

              <UiBillableToggle
                v-model="newProjectBillable"
                variant="pill"
                :label="$t('catalog.billableDefault')"
              />
            </div>

            <button
              type="submit"
              class="btn-press inline-flex h-10 w-full items-center justify-center gap-1.5 bg-accent px-4 text-xs font-semibold uppercase tracking-wider text-white hover:bg-accent-hover transition-colors"
            >
              <Plus class="h-4 w-4" aria-hidden="true" />
              <span>{{ $t('catalog.addProject') }}</span>
            </button>
          </form>

          <ul class="mt-3 divide-y divide-border-hairline">
            <li v-for="proj in catalogStore.sortedProjects" :key="proj.id">
              <button
                type="button"
                class="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors"
                :class="
                  selectedProjectId === proj.id
                    ? 'bg-bg-hover text-text-primary'
                    : 'text-text-muted hover:bg-bg-hover/60 hover:text-text-primary'
                "
                @click="selectProject(proj)"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <span
                    class="h-3 w-3 shrink-0"
                    :style="{ backgroundColor: proj.color }"
                  />
                  <span class="truncate text-sm font-medium text-text-primary">
                    {{ displayProjectName(proj) }}
                  </span>
                </div>

                <div class="flex items-center gap-1.5 shrink-0">
                  <span
                    v-if="proj.systemKey === 'unassigned'"
                    class="border border-border-hairline bg-bg-primary px-2 py-0.5 text-xs font-medium text-text-muted"
                  >
                    {{ $t('catalog.systemBadge') }}
                  </span>
                  <span
                    v-if="proj.isBillableDefault"
                    class="border border-signal/40 bg-signal-soft px-2 py-0.5 text-xs font-medium text-signal"
                  >
                    $
                  </span>
                  <span class="tabular-telemetry inline-flex items-center gap-1 text-xs text-text-muted">
                    <Tag class="h-3 w-3" aria-hidden="true" />
                    <span>{{ catalogStore.getTagsForProject(proj.id).length }}</span>
                  </span>
                </div>
              </button>
            </li>
          </ul>
        </div>
      </div>

      <!-- Right Column: Project Settings + Project-Scoped Tags -->
      <div v-if="selectedProject" class="lg:col-span-7 space-y-6">
        <!-- Project Inspector Header & Form -->
        <div class="relative overflow-hidden border border-border-hairline bg-bg-elevated p-5 sm:p-6">
          <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border-hairline pb-4">
            <div class="flex flex-wrap items-center gap-2.5">
              <span
                class="h-3.5 w-3.5"
                :style="{ backgroundColor: selectedProject.color }"
              />
              <h2 class="text-base font-semibold text-text-primary">
                {{ displayProjectName(selectedProject) }}
              </h2>
              <span
                class="border px-2 py-0.5 text-xs font-medium"
                :class="
                  selectedProject.isBillableDefault
                    ? 'border-signal/40 bg-signal-soft text-signal'
                    : 'border-border-hairline bg-bg-primary text-text-muted'
                "
              >
                {{
                  selectedProject.isBillableDefault
                    ? $t('catalog.billableBadge')
                    : $t('catalog.nonBillableBadge')
                }}
              </span>
              <span
                v-if="projectSavedFlash"
                class="inline-flex items-center gap-1 border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-500"
              >
                <Check class="h-3 w-3" aria-hidden="true" />
                <span>{{ $t('settings.savedBadge') }}</span>
              </span>
            </div>

            <button
              v-if="selectedProject.systemKey !== 'unassigned'"
              type="button"
              data-testid="catalog-project-delete"
              class="btn-press inline-flex h-8 items-center gap-1.5 border border-destructive/40 bg-destructive/10 px-3 text-xs font-medium uppercase text-destructive hover:bg-destructive/20"
              @click="requestDeleteSelectedProject"
            >
              <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
              <span>{{ $t('catalog.deleteProject') }}</span>
            </button>
          </div>

          <form class="mt-4 space-y-4" @submit.prevent="handleUpdateSelectedProject">
            <div class="flex flex-wrap items-center gap-3">
              <input
                v-if="selectedProject.systemKey !== 'unassigned'"
                v-model="editName"
                type="text"
                required
                class="h-9 flex-1 min-w-[180px] border border-border-input bg-bg-primary px-3 text-sm text-text-primary focus:border-signal focus:outline-none"
              />
              <input
                v-model="editColor"
                type="color"
                class="h-9 w-9 cursor-pointer border border-border-input bg-bg-primary p-0.5"
              />
              <UiBillableToggle
                v-model="editBillable"
                variant="pill"
                :label="$t('catalog.billableDefault')"
              />
              <button
                type="submit"
                class="btn-press inline-flex h-9 items-center border border-border-hairline bg-bg-primary px-3.5 text-xs font-medium uppercase text-text-primary hover:bg-bg-hover"
              >
                {{ $t('catalog.saveChanges') }}
              </button>
            </div>

            <!-- Project-Bound Azure DevOps Connection Summary -->
            <div
              v-if="selectedProject.systemKey !== 'unassigned'"
              class="border-t border-border-hairline pt-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div class="min-w-0 space-y-1">
                <div class="label-eyebrow flex items-center gap-2 text-text-muted">
                  <GitBranch class="h-3.5 w-3.5 text-signal" aria-hidden="true" />
                  <span>{{ $t('projects.adoOverrideTitle') }}</span>
                </div>
                <p v-if="boundAdoConnection" class="tabular-telemetry text-xs text-text-primary">
                  {{ boundAdoConnection.organization }} / {{ boundAdoConnection.defaultProject }} · {{ boundAdoConnection.defaultWorkItemType }} ({{ boundAdoConnection.tokenHint }})
                </p>
                <p v-else class="text-xs text-text-muted">
                  {{ $t('projects.adoUnboundHint') }}
                </p>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <NuxtLink
                  v-if="boundAdoConnection"
                  :to="localePath(`/app/tasks?projectId=${selectedProject.id}`)"
                  class="btn-press inline-flex h-8 items-center gap-1.5 border border-border-hairline bg-bg-primary px-3 text-xs font-medium text-text-primary hover:border-signal transition-colors"
                >
                  <span>{{ $t('projects.goToTasks') }}</span>
                </NuxtLink>
                <NuxtLink
                  :to="
                    boundAdoConnection
                      ? localePath(`/app/settings?editAdo=${boundAdoConnection.id}#azure-devops`)
                      : localePath(`/app/settings?projectId=${selectedProject.id}#azure-devops`)
                  "
                  class="btn-press inline-flex h-8 items-center gap-1.5 border border-signal/50 bg-signal-soft px-3 text-xs font-medium text-signal hover:bg-accent hover:text-white transition-colors"
                >
                  <GitBranch class="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {{
                      boundAdoConnection
                        ? $t('ado.settings.editButton')
                        : $t('projects.connectAdoProjectButton')
                    }}
                  </span>
                </NuxtLink>
              </div>
            </div>
          </form>
        </div>

        <!-- Project-Scoped Tags -->
        <div class="relative overflow-hidden border border-border-hairline bg-bg-elevated p-5 sm:p-6">
          <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
          <div class="flex items-center justify-between border-b border-border-hairline pb-3">
            <div class="label-eyebrow flex items-center gap-2 text-signal">
              <Tag class="h-4 w-4" aria-hidden="true" />
              <span>{{ $t('catalog.scopedTagsTitle') }} ({{ scopedTags.length }})</span>
            </div>
          </div>
          <p class="mt-2.5 text-ui text-text-muted">
            {{ $t('catalog.scopedTagsHint') }}
          </p>

          <form class="mt-3.5 flex gap-2" @submit.prevent="handleCreateTag">
            <input
              v-model="newTagName"
              type="text"
              required
              :placeholder="$t('catalog.newTagPlaceholder')"
              class="h-10 flex-1 border border-border-input bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
            />
            <button
              type="submit"
              class="btn-press inline-flex h-10 items-center gap-1.5 bg-accent px-4 text-xs font-semibold uppercase text-white hover:bg-accent-hover transition-colors"
            >
              <Plus class="h-4 w-4" aria-hidden="true" />
              <span>{{ $t('catalog.addTag') }}</span>
            </button>
          </form>

          <div v-if="scopedTags.length === 0" class="mt-4 text-ui text-text-muted">
            {{ $t('catalog.noTagsYet') }}
          </div>

          <div v-else class="mt-4 space-y-2.5">
            <div class="flex flex-wrap gap-2">
              <span
                v-for="tag in scopedTags"
                :key="tag.id"
                :data-testid="`catalog-tag-chip-${tag.id}`"
                class="inline-flex items-center gap-1.5 border bg-bg-primary px-3 py-1.5 text-ui font-medium text-text-primary transition-colors"
                :class="editingTagId === tag.id ? 'border-signal' : 'border-border-hairline'"
              >
                <form
                  v-if="editingTagId === tag.id"
                  class="inline-flex items-center gap-1"
                  @submit.prevent="saveEditTag(tag.id)"
                >
                  <input
                    ref="tagRenameInputRef"
                    v-model="editingTagName"
                    type="text"
                    maxlength="80"
                    data-testid="catalog-tag-rename-input"
                    :aria-label="$t('catalog.renameTagAria', { name: tag.name })"
                    class="h-7 w-36 border border-border-input bg-bg-elevated px-2 text-ui text-text-primary focus:border-signal focus:outline-none"
                    @keydown.esc.stop.prevent="cancelEditTag"
                  />
                  <button
                    type="submit"
                    data-testid="catalog-tag-rename-save"
                    class="inline-flex h-6 w-6 items-center justify-center text-emerald-500 hover:bg-emerald-500/15 transition-colors"
                    :aria-label="$t('catalog.renameTagSave')"
                    :title="$t('catalog.renameTagSave')"
                  >
                    <Check class="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    data-testid="catalog-tag-rename-cancel"
                    class="inline-flex h-6 w-6 items-center justify-center text-text-muted hover:text-text-primary transition-colors"
                    :aria-label="$t('catalog.renameTagCancel')"
                    :title="$t('catalog.renameTagCancel')"
                    @click="cancelEditTag"
                  >
                    <X class="h-3.5 w-3.5" />
                  </button>
                </form>

                <template v-else>
                  <button
                    type="button"
                    class="hover:text-signal transition-colors text-left"
                    :title="$t('catalog.renameTagAria', { name: tag.name })"
                    @click="startEditTag(tag)"
                  >
                    {{ tag.name }}
                  </button>
                  <button
                    type="button"
                    data-testid="catalog-tag-rename-trigger"
                    class="inline-flex h-6 w-6 items-center justify-center text-text-muted hover:text-signal transition-colors"
                    :aria-label="$t('catalog.renameTagAria', { name: tag.name })"
                    :title="$t('catalog.renameTagAria', { name: tag.name })"
                    @click="startEditTag(tag)"
                  >
                    <Pencil class="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    data-testid="catalog-tag-delete-trigger"
                    class="inline-flex h-6 w-6 items-center justify-center text-text-muted hover:text-destructive transition-colors"
                    :aria-label="$t('catalog.deleteTagAria', { name: tag.name })"
                    :title="$t('catalog.deleteTagAria', { name: tag.name })"
                    @click="requestDeleteTag(tag)"
                  >
                    <Trash2 class="h-3 w-3" />
                  </button>
                </template>
              </span>
            </div>

            <p
              v-if="tagRenameError"
              data-testid="catalog-tag-rename-error"
              class="text-ui text-destructive"
            >
              {{ $t(`catalog.tagRenameErrors.${tagRenameError}`) }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <UiConfirmDialog
      :open="Boolean(pendingDelete)"
      :title="confirmDialogTitle"
      :description="confirmDialogDescription"
      :detail="confirmDialogDetail"
      :loading="isDeleting"
      test-id="catalog-delete-confirm-dialog"
      @update:open="(open) => { if (!open && !isDeleting) pendingDelete = null; }"
      @confirm="confirmDelete"
      @cancel="() => { if (!isDeleting) pendingDelete = null; }"
    />
  </div>
</template>
