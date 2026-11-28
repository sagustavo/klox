<script setup lang="ts">
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  GitBranch,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Unlink,
} from 'lucide-vue-next';
import { normalizeAdoOrgUrl, type AdoErrorCode } from '~/domain/ado';
import { PROJECT_COLOR_PALETTE } from '~/domain/invariants';
import type { AdoConnectionSummary, EntityId, Project } from '~/domain/types';
import { useAdoStore, type AdoProjectOption } from '~/stores/ado';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';

const CREATE_NEW_PROJECT_VALUE = '__create_klox_project__';

const emit = defineEmits<{
  saved: [];
}>();

const { t } = useI18n();
const route = useRoute();
const authStore = useAuthStore();
const catalogStore = useCatalogStore();
const adoStore = useAdoStore();

// Form visibility & active editing target (`null` = new connection, `string` = editing ID)
const formOpen = ref(false);
const editingConnectionId = ref<string | null>(null);

// Form fields
const selectedKloxProjectId = ref<string>('');
const inlineNewProjectName = ref('');
const inlineNewProjectColor = ref<string>(PROJECT_COLOR_PALETTE[0] ?? '#3B82F6');
const orgInput = ref('https://dev.azure.com/');
const patInput = ref('');
const showPat = ref(false);
const projectInput = ref('');
const workItemTypeInput = ref('Task');

const loadedProjects = ref<AdoProjectOption[]>([]);
const loadedTypes = ref(adoStore.workItemTypes);
const manualProjectEntry = ref(false);
const loadingPreview = ref(false);

const actionError = ref<AdoErrorCode | null>(null);
const actionSuccess = ref<string | null>(null);
const pendingDisconnect = ref<AdoConnectionSummary | null>(null);
let successTimer: ReturnType<typeof setTimeout> | null = null;

const nonUnassignedProjects = computed(() =>
  catalogStore.sortedProjects.filter((p) => p.systemKey !== 'unassigned')
);

const availableKloxProjects = computed<Project[]>(() => {
  const takenIds = new Set(
    adoStore.connections
      .filter((c) => c.id !== editingConnectionId.value && c.kloxProjectId)
      .map((c) => c.kloxProjectId)
  );
  return nonUnassignedProjects.value.filter((p) => !takenIds.has(p.id));
});

const editingConnection = computed(() =>
  editingConnectionId.value ? adoStore.getConnectionById(editingConnectionId.value) : null
);

function getKloxProject(projectId?: EntityId | null): Project | undefined {
  if (!projectId) return undefined;
  return catalogStore.getProjectById(projectId);
}

function resetFormDefaults(preferredKloxProjectId?: string) {
  editingConnectionId.value = null;
  const candidate =
    preferredKloxProjectId &&
    availableKloxProjects.value.some((p) => p.id === preferredKloxProjectId)
      ? preferredKloxProjectId
      : availableKloxProjects.value[0]?.id ?? CREATE_NEW_PROJECT_VALUE;
  selectedKloxProjectId.value = candidate;
  inlineNewProjectName.value = '';
  inlineNewProjectColor.value =
    PROJECT_COLOR_PALETTE[catalogStore.projects.length % PROJECT_COLOR_PALETTE.length] ?? '#3B82F6';
  orgInput.value = 'https://dev.azure.com/';
  patInput.value = '';
  showPat.value = false;
  projectInput.value = '';
  workItemTypeInput.value = 'Task';
  loadedProjects.value = [];
  loadedTypes.value = [];
  manualProjectEntry.value = false;
  actionError.value = null;
}

function openAddForm(preferredKloxProjectId?: string) {
  resetFormDefaults(preferredKloxProjectId);
  formOpen.value = true;
}

function openEditForm(conn: AdoConnectionSummary) {
  editingConnectionId.value = conn.id;
  if (
    conn.kloxProjectId &&
    availableKloxProjects.value.some((p) => p.id === conn.kloxProjectId)
  ) {
    selectedKloxProjectId.value = conn.kloxProjectId;
  } else {
    selectedKloxProjectId.value = availableKloxProjects.value[0]?.id ?? CREATE_NEW_PROJECT_VALUE;
  }
  inlineNewProjectName.value = '';
  orgInput.value = conn.orgUrl;
  patInput.value = '';
  showPat.value = false;
  projectInput.value = conn.defaultProject;
  workItemTypeInput.value = conn.defaultWorkItemType || 'Task';
  loadedProjects.value = [];
  loadedTypes.value = [];
  manualProjectEntry.value = false;
  actionError.value = null;
  formOpen.value = true;
  void handleLoadAdoProjects(false);
}

function closeForm() {
  formOpen.value = false;
  showPat.value = false;
  patInput.value = '';
  actionError.value = null;
}

onMounted(async () => {
  if (!authStore.user) return;
  await Promise.all([
    catalogStore.hydrate(authStore.user.uid, authStore.isDemoMode),
    adoStore.hydrate(authStore.user.uid, authStore.isDemoMode),
  ]);

  const editAdoQuery = typeof route.query.editAdo === 'string' ? route.query.editAdo.trim() : '';
  const projectIdQuery =
    typeof route.query.projectId === 'string' ? route.query.projectId.trim() : '';

  if (editAdoQuery) {
    const match = adoStore.getConnectionById(editAdoQuery);
    if (match) {
      openEditForm(match);
      return;
    }
  }

  if (projectIdQuery) {
    const bound = adoStore.getConnectionForProject(projectIdQuery);
    if (bound) {
      openEditForm(bound);
    } else {
      openAddForm(projectIdQuery);
    }
    return;
  }

  if (adoStore.connections.length === 0) {
    openAddForm();
  }
});

onBeforeUnmount(() => {
  showPat.value = false;
  if (successTimer) clearTimeout(successTimer);
});

function showSuccess(msg: string) {
  actionError.value = null;
  actionSuccess.value = msg;
  emit('saved');
  if (successTimer) clearTimeout(successTimer);
  successTimer = setTimeout(() => {
    actionSuccess.value = null;
  }, 4000);
}

const availableWorkItemTypes = computed(() => {
  if (loadedTypes.value.length > 0) return loadedTypes.value;
  if (adoStore.workItemTypes.length > 0) return adoStore.workItemTypes;
  return [
    { name: 'Task', supportsCompletedWork: true },
    { name: 'Bug', supportsCompletedWork: true },
    { name: 'Product Backlog Item', supportsCompletedWork: false },
    { name: 'User Story', supportsCompletedWork: false },
  ];
});

const selectedTypeSupportsCompletedWork = computed(() => {
  const list = availableWorkItemTypes.value;
  if (list.length === 0) return true;
  const match = list.find(
    (wt) => wt.name.toLowerCase() === workItemTypeInput.value.toLowerCase()
  );
  return match ? match.supportsCompletedWork : true;
});

async function handleLoadAdoProjects(showErrors = true) {
  const norm = normalizeAdoOrgUrl(orgInput.value);
  if (!norm.valid) {
    if (showErrors) actionError.value = 'ADO_INVALID_ORG_URL';
    return;
  }
  if (!patInput.value.trim() && !editingConnectionId.value && !authStore.isDemoMode) {
    if (showErrors) actionError.value = 'ADO_INVALID_INPUT';
    return;
  }

  loadingPreview.value = true;
  if (showErrors) actionError.value = null;
  try {
    const res = await adoStore.previewProjectsAndTypes({
      isDemo: authStore.isDemoMode,
      connectionId: editingConnectionId.value || undefined,
      orgUrl: norm.orgUrl,
      defaultProject: projectInput.value.trim() || undefined,
      pat: patInput.value.trim() || undefined,
    });
    if (!res.ok) {
      if (showErrors) actionError.value = res.errorCode ?? 'ADO_UNAVAILABLE';
      return;
    }
    loadedProjects.value = res.projects;
    loadedTypes.value = res.workItemTypes;
    manualProjectEntry.value = false;
    if (
      res.projects.length > 0 &&
      !res.projects.some((p) => p.name.toLowerCase() === projectInput.value.trim().toLowerCase())
    ) {
      projectInput.value = res.projects[0]!.name;
    }
  } finally {
    loadingPreview.value = false;
  }
}

async function handleSaveConnection() {
  if (!authStore.user) return;
  actionError.value = null;
  actionSuccess.value = null;

  const norm = normalizeAdoOrgUrl(orgInput.value);
  if (!norm.valid) {
    actionError.value = 'ADO_INVALID_ORG_URL';
    return;
  }
  if (!projectInput.value.trim()) {
    actionError.value = 'ADO_INVALID_INPUT';
    return;
  }
  if (!editingConnectionId.value && !patInput.value.trim() && !authStore.isDemoMode) {
    actionError.value = 'ADO_INVALID_INPUT';
    return;
  }

  let targetKloxProjectId = selectedKloxProjectId.value;
  if (targetKloxProjectId === CREATE_NEW_PROJECT_VALUE) {
    if (!inlineNewProjectName.value.trim()) {
      actionError.value = 'ADO_INVALID_INPUT';
      return;
    }
    const createdProj = await catalogStore.createProject({
      uid: authStore.user.uid,
      isDemo: authStore.isDemoMode,
      name: inlineNewProjectName.value.trim(),
      color: inlineNewProjectColor.value,
      isBillableDefault: true,
    });
    targetKloxProjectId = createdProj.id;
  }

  if (!targetKloxProjectId) {
    actionError.value = 'ADO_INVALID_INPUT';
    return;
  }

  const res = await adoStore.saveConnection({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    connectionId: editingConnectionId.value || undefined,
    kloxProjectId: targetKloxProjectId,
    orgUrl: norm.orgUrl,
    defaultProject: projectInput.value.trim(),
    defaultWorkItemType: workItemTypeInput.value.trim() || 'Task',
    pat: patInput.value.trim() || undefined,
  });

  if (!res.ok) {
    actionError.value = res.errorCode ?? 'ADO_UNAVAILABLE';
    return;
  }

  showPat.value = false;
  patInput.value = '';
  formOpen.value = false;
  showSuccess(t('ado.settings.connectedSuccess'));
}

async function handleEnableDemo() {
  if (!authStore.user) return;
  actionError.value = null;
  const res = await adoStore.enableDemoConnection(authStore.user.uid);
  if (res.ok) {
    formOpen.value = false;
    showSuccess(t('ado.settings.connectedSuccess'));
  }
}

async function confirmDisconnect() {
  if (!authStore.user || !pendingDisconnect.value) return;
  const targetId = pendingDisconnect.value.id;
  await adoStore.disconnectConnection({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    connectionId: targetId,
  });
  pendingDisconnect.value = null;
  if (editingConnectionId.value === targetId) {
    closeForm();
  }
  showSuccess(t('ado.settings.disconnectedSuccess'));
}
</script>

<template>
  <UiInstrumentPanel id="azure-devops" signal-line>
    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-4 border-b border-border-hairline pb-4">
      <div>
        <div class="flex flex-wrap items-center gap-2.5">
          <GitBranch class="h-4 w-4 text-signal" aria-hidden="true" />
          <h2 class="display-wide text-lg text-text-primary">
            {{ $t('ado.settings.title') }}
          </h2>
          <span class="tabular-telemetry border border-signal/40 bg-signal-soft px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-signal">
            {{ $t('ado.badges.earlyAccess') }}
          </span>
        </div>
        <p class="mt-1.5 text-sm text-text-muted">
          {{ $t('ado.settings.subtitle') }}
        </p>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <span
          class="border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider"
          :class="
            adoStore.isConnected
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
              : 'border-border-hairline bg-bg-primary text-text-muted'
          "
        >
          {{
            adoStore.isConnected
              ? $t('ado.settings.connectedCountBadge', { count: adoStore.connections.length })
              : $t('settings.auth.statusNotConnected')
          }}
        </span>

        <button
          v-if="!formOpen || editingConnectionId"
          type="button"
          data-testid="ado-add-connection-btn"
          class="btn-press inline-flex h-8 items-center gap-1.5 bg-accent px-3 text-xs font-semibold uppercase tracking-wider text-white hover:bg-accent-hover transition-colors"
          @click="openAddForm()"
        >
          <Plus class="h-3.5 w-3.5" aria-hidden="true" />
          <span>{{ $t('ado.settings.addConnectionButton') }}</span>
        </button>
      </div>
    </div>

    <!-- Demo Mode Banner -->
    <div
      v-if="authStore.isDemoMode && !adoStore.isConnected"
      class="mt-4 flex flex-wrap items-center justify-between gap-3 border border-signal/40 bg-signal-soft/40 p-3.5 text-ui"
    >
      <p class="text-text-muted">
        {{ $t('ado.settings.demoHint') }}
      </p>
      <button
        type="button"
        data-testid="ado-enable-demo-btn"
        :disabled="adoStore.loading"
        class="btn-press inline-flex h-9 items-center gap-2 bg-accent px-3.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-accent-hover transition-colors"
        @click="handleEnableDemo"
      >
        <GitBranch class="h-3.5 w-3.5" aria-hidden="true" />
        <span>{{ $t('ado.settings.enableDemoButton') }}</span>
      </button>
    </div>

    <!-- Feedback Banners -->
    <div
      v-if="actionSuccess"
      role="status"
      class="mt-4 flex items-center gap-2 border border-emerald-500/40 bg-emerald-500/10 p-3 text-ui text-emerald-500"
    >
      <CheckCircle2 class="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{{ actionSuccess }}</span>
    </div>

    <div
      v-if="actionError"
      role="alert"
      class="mt-4 flex items-start gap-2 border border-destructive/50 bg-destructive/10 p-3 text-ui text-destructive"
    >
      <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{{ $t(`ado.errors.${actionError}`) }}</span>
    </div>

    <!-- Connected Project Cards List -->
    <div v-if="adoStore.connections.length > 0" class="mt-4 space-y-2.5">
      <div
        v-for="conn in adoStore.connections"
        :key="conn.id"
        :data-testid="`ado-connection-card-${conn.id}`"
        class="flex flex-wrap items-center justify-between gap-3 border bg-bg-primary p-4 transition-colors"
        :class="editingConnectionId === conn.id && formOpen ? 'border-signal' : 'border-border-hairline'"
      >
        <div class="space-y-1.5 min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <!-- Linked Klox Project Pill -->
            <span
              v-if="getKloxProject(conn.kloxProjectId)"
              class="inline-flex items-center gap-1.5 border border-border-hairline bg-bg-elevated px-2.5 py-0.5 text-xs font-semibold text-text-primary"
            >
              <span
                class="h-2.5 w-2.5 shrink-0"
                :style="{ backgroundColor: getKloxProject(conn.kloxProjectId)?.color }"
                aria-hidden="true"
              />
              <span>{{ getKloxProject(conn.kloxProjectId)?.name }}</span>
            </span>
            <span
              v-else
              class="inline-flex items-center gap-1 border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-500"
            >
              {{ $t('ado.settings.needsProjectBinding') }}
            </span>

            <span class="text-text-muted">→</span>

            <a
              :href="conn.orgUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary hover:text-signal transition-colors"
            >
              <span>{{ conn.organization }}</span>
              <ExternalLink class="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
            </a>
            <span class="text-text-muted">/</span>
            <span class="text-sm font-medium text-text-primary">{{ conn.defaultProject }}</span>
          </div>

          <div class="tabular-telemetry flex flex-wrap items-center gap-3 text-xs text-text-muted">
            <span>{{ $t('ado.settings.tokenLabel') }}: {{ conn.tokenHint }}</span>
            <span>·</span>
            <span>{{ $t('ado.settings.defaultTypeLabel') }}: {{ conn.defaultWorkItemType }}</span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            :data-testid="`ado-edit-btn-${conn.id}`"
            :disabled="adoStore.loading"
            class="btn-press inline-flex h-8 items-center gap-1.5 border border-border-hairline bg-bg-elevated px-3 text-xs font-medium text-text-primary hover:border-signal transition-colors"
            @click="openEditForm(conn)"
          >
            <Pencil class="h-3.5 w-3.5" aria-hidden="true" />
            <span>{{ $t('ado.settings.editButton') }}</span>
          </button>
          <button
            type="button"
            data-testid="ado-disconnect-btn"
            :disabled="adoStore.loading"
            class="btn-press inline-flex h-8 items-center gap-1.5 border border-destructive/40 bg-destructive/10 px-3 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors"
            @click="pendingDisconnect = conn"
          >
            <Unlink class="h-3.5 w-3.5" aria-hidden="true" />
            <span>{{ $t('ado.settings.disconnectButton') }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Create / Edit Connection Form -->
    <form
      v-if="formOpen"
      class="mt-5 border border-border-hairline bg-bg-primary/60 p-4 sm:p-5 space-y-4"
      @submit.prevent="handleSaveConnection"
    >
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border-hairline pb-3">
        <span class="label-eyebrow text-signal">
          {{
            editingConnection
              ? $t('ado.settings.editFormTitle')
              : $t('ado.settings.newFormTitle')
          }}
        </span>
        <span v-if="editingConnection && !editingConnection.kloxProjectId" class="text-xs text-amber-500">
          {{ $t('ado.settings.legacyMigrationHint') }}
        </span>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <!-- Required Linked Klox Project -->
        <div class="sm:col-span-2">
          <label for="ado-klox-project" class="label-eyebrow block text-text-muted">
            {{ $t('ado.settings.kloxProjectLabel') }} <span aria-hidden="true">*</span>
          </label>
          <select
            id="ado-klox-project"
            v-model="selectedKloxProjectId"
            required
            data-testid="ado-klox-project-select"
            class="mt-1.5 h-10 w-full border border-border-input bg-bg-primary px-3 text-sm text-text-primary focus:border-signal focus:outline-none"
          >
            <option v-for="proj in availableKloxProjects" :key="proj.id" :value="proj.id">
              {{ proj.name }}
            </option>
            <option :value="CREATE_NEW_PROJECT_VALUE">
              + {{ $t('ado.settings.createKloxProjectOption') }}
            </option>
          </select>
          <p class="mt-1 text-xs text-text-muted">
            {{ $t('ado.settings.kloxProjectHint') }}
          </p>

          <!-- Inline New Klox Project Creator -->
          <div
            v-if="selectedKloxProjectId === CREATE_NEW_PROJECT_VALUE"
            class="mt-2.5 flex flex-wrap items-center gap-2 border border-border-hairline bg-bg-elevated p-3"
          >
            <input
              v-model="inlineNewProjectName"
              type="text"
              required
              data-testid="ado-inline-klox-project-name"
              :placeholder="$t('catalog.newProjectPlaceholder')"
              class="h-9 flex-1 min-w-[180px] border border-border-input bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
            />
            <div class="flex items-center gap-1.5">
              <button
                v-for="swatch in PROJECT_COLOR_PALETTE"
                :key="swatch"
                type="button"
                class="h-6 w-6 border transition-transform"
                :class="
                  inlineNewProjectColor.toUpperCase() === swatch
                    ? 'border-text-primary scale-110'
                    : 'border-border-hairline opacity-75 hover:opacity-100'
                "
                :style="{ backgroundColor: swatch }"
                @click="inlineNewProjectColor = swatch"
              />
            </div>
          </div>
        </div>

        <!-- Organization URL -->
        <div>
          <label for="ado-org-url" class="label-eyebrow block text-text-muted">
            {{ $t('ado.settings.orgUrlLabel') }} <span aria-hidden="true">*</span>
          </label>
          <input
            id="ado-org-url"
            v-model="orgInput"
            type="text"
            required
            autocorrect="off"
            autocapitalize="none"
            spellcheck="false"
            data-testid="ado-org-url-input"
            placeholder="https://dev.azure.com/your-org"
            class="tabular-telemetry mt-1.5 h-10 w-full border border-border-input bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
          />
          <p class="mt-1 text-xs text-text-muted">
            {{ $t('ado.settings.orgUrlHint') }}
          </p>
        </div>

        <!-- PAT with Accessible Show/Hide Toggle -->
        <div>
          <label for="ado-pat" class="label-eyebrow block text-text-muted">
            {{ $t('ado.settings.patLabel') }}
            <span v-if="!editingConnectionId && !authStore.isDemoMode" aria-hidden="true">*</span>
          </label>
          <div class="relative mt-1.5">
            <input
              id="ado-pat"
              v-model="patInput"
              :type="showPat ? 'text' : 'password'"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="none"
              spellcheck="false"
              :required="!editingConnectionId && !authStore.isDemoMode"
              data-testid="ado-pat-input"
              :placeholder="
                editingConnectionId
                  ? $t('ado.settings.patPlaceholderConnected')
                  : $t('ado.settings.patPlaceholder')
              "
              class="h-10 w-full border border-border-input bg-bg-primary pl-3 pr-10 text-sm text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
            />
            <button
              type="button"
              data-testid="ado-pat-visibility-toggle"
              :aria-pressed="showPat"
              :aria-label="showPat ? $t('ado.settings.hidePatAria') : $t('ado.settings.showPatAria')"
              :title="showPat ? $t('ado.settings.hidePatAria') : $t('ado.settings.showPatAria')"
              class="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              @click="showPat = !showPat"
            >
              <EyeOff v-if="showPat" class="h-4 w-4" aria-hidden="true" />
              <Eye v-else class="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p class="mt-1 text-xs text-text-muted">
            {{ $t('ado.settings.patHint') }}
          </p>
        </div>

        <!-- Azure DevOps Team Project -->
        <div>
          <div class="flex items-center justify-between gap-2">
            <label for="ado-default-project" class="label-eyebrow block text-text-muted">
              {{ $t('ado.settings.projectLabel') }} <span aria-hidden="true">*</span>
            </label>
            <button
              type="button"
              :disabled="loadingPreview"
              class="inline-flex items-center gap-1 text-xs font-medium text-signal hover:underline disabled:opacity-50"
              @click="handleLoadAdoProjects(true)"
            >
              <RefreshCw class="h-3 w-3" :class="loadingPreview ? 'animate-spin' : ''" aria-hidden="true" />
              <span>{{ $t('ado.settings.loadProjectsButton') }}</span>
            </button>
          </div>
          <select
            v-if="loadedProjects.length > 0 && !manualProjectEntry"
            id="ado-default-project"
            v-model="projectInput"
            data-testid="ado-project-select"
            class="mt-1.5 h-10 w-full border border-border-input bg-bg-primary px-3 text-sm text-text-primary focus:border-signal focus:outline-none"
            @change="handleLoadAdoProjects(false)"
          >
            <option v-for="proj in loadedProjects" :key="proj.id" :value="proj.name">
              {{ proj.name }}
            </option>
          </select>
          <input
            v-else
            id="ado-default-project"
            v-model="projectInput"
            type="text"
            required
            data-testid="ado-project-input"
            :placeholder="$t('ado.settings.projectPlaceholder')"
            class="mt-1.5 h-10 w-full border border-border-input bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
          />
        </div>

        <!-- Default Work Item Type -->
        <div>
          <label for="ado-default-type" class="label-eyebrow block text-text-muted">
            {{ $t('ado.settings.defaultTypeLabel') }}
          </label>
          <select
            id="ado-default-type"
            v-model="workItemTypeInput"
            data-testid="ado-workitem-type-select"
            class="mt-1.5 h-10 w-full border border-border-input bg-bg-primary px-3 text-sm text-text-primary focus:border-signal focus:outline-none"
          >
            <option v-for="wt in availableWorkItemTypes" :key="wt.name" :value="wt.name">
              {{ wt.name }}{{ wt.supportsCompletedWork ? '' : ` — ${$t('ado.scrumNotice.typeShortBadge')}` }}
            </option>
          </select>
          <p v-if="!selectedTypeSupportsCompletedWork" class="mt-1 text-xs text-amber-500">
            {{ $t('ado.scrumNotice.typeMissingField', { type: workItemTypeInput }) }}
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-border-hairline pt-4">
        <span class="text-xs text-text-muted">
          {{ $t('ado.settings.syncBoundaryNote') }}
        </span>

        <div class="flex items-center gap-2">
          <button
            v-if="adoStore.connections.length > 0"
            type="button"
            class="btn-press inline-flex h-10 items-center border border-border-hairline bg-bg-elevated px-4 text-xs font-medium text-text-primary hover:bg-bg-hover transition-colors"
            @click="closeForm"
          >
            {{ $t('confirm.cancelAction') }}
          </button>

          <button
            type="submit"
            data-testid="ado-save-connection-btn"
            :disabled="adoStore.loading"
            class="btn-press inline-flex h-10 items-center gap-2 bg-accent px-5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            <Loader2 v-if="adoStore.loading" class="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>
              {{
                editingConnectionId
                  ? $t('ado.settings.updateButton')
                  : $t('ado.settings.connectButton')
              }}
            </span>
          </button>
        </div>
      </div>
    </form>

    <UiConfirmDialog
      :open="Boolean(pendingDisconnect)"
      :title="$t('ado.settings.disconnectTitle')"
      :description="$t('ado.settings.disconnectDesc')"
      :detail="pendingDisconnect ? `${pendingDisconnect.organization} / ${pendingDisconnect.defaultProject}` : undefined"
      :confirm-label="$t('ado.settings.disconnectButton')"
      :loading="adoStore.loading"
      test-id="ado-disconnect-confirm"
      @update:open="(open) => { if (!open && !adoStore.loading) pendingDisconnect = null; }"
      @confirm="confirmDisconnect"
      @cancel="() => { if (!adoStore.loading) pendingDisconnect = null; }"
    />
  </UiInstrumentPanel>
</template>
