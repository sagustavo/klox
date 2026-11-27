<script setup lang="ts">
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
  Unlink,
} from 'lucide-vue-next';
import { normalizeAdoOrgUrl, type AdoErrorCode } from '~/domain/ado';
import { useAdoStore } from '~/stores/ado';
import { useAuthStore } from '~/stores/auth';

const emit = defineEmits<{
  saved: [];
}>();

const { t } = useI18n();
const authStore = useAuthStore();
const adoStore = useAdoStore();

const orgInput = ref('https://dev.azure.com/');
const patInput = ref('');
const projectInput = ref('');
const workItemTypeInput = ref('Task');

const actionError = ref<AdoErrorCode | null>(null);
const actionSuccess = ref<string | null>(null);
const disconnectOpen = ref(false);
let successTimer: ReturnType<typeof setTimeout> | null = null;

function syncFieldsFromConnection() {
  if (adoStore.connection?.connected) {
    orgInput.value = adoStore.connection.orgUrl;
    projectInput.value = adoStore.connection.defaultProject;
    workItemTypeInput.value = adoStore.connection.defaultWorkItemType || 'Task';
  }
}

onMounted(async () => {
  if (!authStore.user) return;
  await adoStore.hydrate(authStore.user.uid, authStore.isDemoMode);
  syncFieldsFromConnection();
  if (adoStore.isConnected) {
    await adoStore.fetchProjectsAndTypes({
      isDemo: authStore.isDemoMode,
      orgUrl: adoStore.connection?.orgUrl,
      project: adoStore.connection?.defaultProject,
    });
  }
});

watch(
  () => adoStore.connection,
  () => {
    syncFieldsFromConnection();
  }
);

onBeforeUnmount(() => {
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
  if (adoStore.workItemTypes.length > 0) {
    return adoStore.workItemTypes;
  }
  return [
    { name: 'Task', supportsCompletedWork: true },
    { name: 'Bug', supportsCompletedWork: true },
    { name: 'Product Backlog Item', supportsCompletedWork: false },
    { name: 'User Story', supportsCompletedWork: false },
  ];
});

const selectedTypeSupportsCompletedWork = computed(() => {
  if (adoStore.workItemTypes.length === 0) return true;
  const match = adoStore.workItemTypes.find(
    (wt) => wt.name.toLowerCase() === workItemTypeInput.value.toLowerCase()
  );
  return match ? match.supportsCompletedWork : true;
});

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
  if (!adoStore.isConnected && !patInput.value.trim() && !authStore.isDemoMode) {
    actionError.value = 'ADO_INVALID_INPUT';
    return;
  }

  const res = await adoStore.connectPat({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
    orgUrl: norm.orgUrl,
    defaultProject: projectInput.value.trim(),
    defaultWorkItemType: workItemTypeInput.value.trim() || 'Task',
    pat: patInput.value.trim() || undefined,
  });

  if (!res.ok) {
    actionError.value = res.errorCode ?? 'ADO_UNAVAILABLE';
    return;
  }

  patInput.value = '';
  showSuccess(t('ado.settings.connectedSuccess'));
}

async function handleEnableDemo() {
  if (!authStore.user) return;
  actionError.value = null;
  const res = await adoStore.enableDemoConnection(authStore.user.uid);
  if (res.ok) {
    syncFieldsFromConnection();
    showSuccess(t('ado.settings.connectedSuccess'));
  }
}

async function handleRefreshProjects() {
  if (!adoStore.isConnected) return;
  actionError.value = null;
  const res = await adoStore.fetchProjectsAndTypes({
    isDemo: authStore.isDemoMode,
    orgUrl: orgInput.value,
    project: projectInput.value,
  });
  if (res.errorCode) {
    actionError.value = res.errorCode;
  }
}

async function confirmDisconnect() {
  if (!authStore.user) return;
  await adoStore.disconnect({
    uid: authStore.user.uid,
    isDemo: authStore.isDemoMode,
  });
  disconnectOpen.value = false;
  patInput.value = '';
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

      <span
        class="shrink-0 border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider"
        :class="
          adoStore.isConnected
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
            : 'border-border-hairline bg-bg-primary text-text-muted'
        "
      >
        {{
          adoStore.isConnected
            ? $t('settings.auth.statusConnected')
            : $t('settings.auth.statusNotConnected')
        }}
      </span>
    </div>

    <!-- Demo Mode Banner -->
    <div
      v-if="authStore.isDemoMode"
      class="mt-4 flex flex-wrap items-center justify-between gap-3 border border-signal/40 bg-signal-soft/40 p-3.5 text-ui"
    >
      <p class="text-text-muted">
        {{ $t('ado.settings.demoHint') }}
      </p>
      <button
        v-if="!adoStore.isConnected"
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

    <!-- Connected Summary Bar -->
    <div
      v-if="adoStore.connection?.connected"
      class="mt-4 flex flex-wrap items-center justify-between gap-3 border border-border-hairline bg-bg-primary p-4"
    >
      <div class="space-y-1 min-w-0">
        <div class="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
          <a
            :href="adoStore.connection.orgUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 hover:text-signal transition-colors"
          >
            <span>{{ adoStore.connection.orgUrl }}</span>
            <ExternalLink class="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
          </a>
          <span class="text-text-muted">/</span>
          <span>{{ adoStore.connection.defaultProject }}</span>
        </div>
        <div class="tabular-telemetry flex flex-wrap items-center gap-3 text-xs text-text-muted">
          <span>{{ $t('ado.settings.tokenLabel') }}: {{ adoStore.connection.tokenHint }}</span>
          <span>·</span>
          <span>{{ $t('ado.settings.defaultTypeLabel') }}: {{ adoStore.connection.defaultWorkItemType }}</span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          :disabled="adoStore.loading"
          class="btn-press inline-flex h-8 items-center gap-1.5 border border-border-hairline bg-bg-elevated px-3 text-xs font-medium text-text-primary hover:border-signal transition-colors"
          @click="handleRefreshProjects"
        >
          <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" />
          <span>{{ $t('ado.settings.refreshButton') }}</span>
        </button>
        <button
          type="button"
          data-testid="ado-disconnect-btn"
          :disabled="adoStore.loading"
          class="btn-press inline-flex h-8 items-center gap-1.5 border border-destructive/40 bg-destructive/10 px-3 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors"
          @click="disconnectOpen = true"
        >
          <Unlink class="h-3.5 w-3.5" aria-hidden="true" />
          <span>{{ $t('ado.settings.disconnectButton') }}</span>
        </button>
      </div>
    </div>

    <!-- Connection Form -->
    <form class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2" @submit.prevent="handleSaveConnection">
      <div>
        <label for="ado-org-url" class="label-eyebrow block text-text-muted">
          {{ $t('ado.settings.orgUrlLabel') }}
        </label>
        <input
          id="ado-org-url"
          v-model="orgInput"
          type="text"
          required
          data-testid="ado-org-url-input"
          placeholder="https://dev.azure.com/your-org"
          class="tabular-telemetry mt-1.5 h-10 w-full border border-border-input bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
        />
        <p class="mt-1 text-xs text-text-muted">
          {{ $t('ado.settings.orgUrlHint') }}
        </p>
      </div>

      <div>
        <label for="ado-default-project" class="label-eyebrow block text-text-muted">
          {{ $t('ado.settings.projectLabel') }}
        </label>
        <select
          v-if="adoStore.projects.length > 0"
          id="ado-default-project"
          v-model="projectInput"
          data-testid="ado-project-select"
          class="mt-1.5 h-10 w-full border border-border-input bg-bg-primary px-3 text-sm text-text-primary focus:border-signal focus:outline-none"
          @change="handleRefreshProjects"
        >
          <option v-for="proj in adoStore.projects" :key="proj.id" :value="proj.name">
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

      <div>
        <label for="ado-pat" class="label-eyebrow block text-text-muted">
          {{ $t('ado.settings.patLabel') }}
        </label>
        <input
          id="ado-pat"
          v-model="patInput"
          type="password"
          autocomplete="off"
          :required="!adoStore.isConnected && !authStore.isDemoMode"
          data-testid="ado-pat-input"
          :placeholder="
            adoStore.isConnected
              ? $t('ado.settings.patPlaceholderConnected')
              : $t('ado.settings.patPlaceholder')
          "
          class="mt-1.5 h-10 w-full border border-border-input bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
        />
        <p class="mt-1 text-xs text-text-muted">
          {{ $t('ado.settings.patHint') }}
        </p>
      </div>

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

      <div class="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-border-hairline pt-4">
        <span class="text-xs text-text-muted">
          {{ $t('ado.settings.syncBoundaryNote') }}
        </span>

        <button
          type="submit"
          data-testid="ado-save-connection-btn"
          :disabled="adoStore.loading"
          class="btn-press inline-flex h-10 items-center gap-2 bg-accent px-5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          <Loader2 v-if="adoStore.loading" class="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>
            {{
              adoStore.isConnected
                ? $t('ado.settings.updateButton')
                : $t('ado.settings.connectButton')
            }}
          </span>
        </button>
      </div>
    </form>

    <UiConfirmDialog
      v-model:open="disconnectOpen"
      :title="$t('ado.settings.disconnectTitle')"
      :description="$t('ado.settings.disconnectDesc')"
      :confirm-label="$t('ado.settings.disconnectButton')"
      :loading="adoStore.loading"
      test-id="ado-disconnect-confirm"
      @confirm="confirmDisconnect"
    />
  </UiInstrumentPanel>
</template>
