<script setup lang="ts">
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Play } from 'lucide-vue-next';
import type { TogglDryRunPreview, TogglRowImportStatus } from '~/domain/toggl';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';
import { usePreferencesStore } from '~/stores/preferences';
import { useTimeLogsStore } from '~/stores/timeLogs';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const { t } = useI18n();
const authStore = useAuthStore();
const catalogStore = useCatalogStore();
const timeLogsStore = useTimeLogsStore();
const prefsStore = usePreferencesStore();
const {
  isParsing,
  parseProgress,
  isCommitting,
  importProgress,
  buildPreview,
  refreshPreview,
  commitPreview,
  exportCsvDownload,
} = useTogglCsv();

const csvText = ref('');
const preview = shallowRef<TogglDryRunPreview | null>(null);
const previewStatusFilter = ref<'all' | TogglRowImportStatus>('all');
const commitResult = ref<{
  createdProjects: number;
  createdTags: number;
  importedLogs: number;
  skippedDuplicates: number;
} | null>(null);

onMounted(async () => {
  await authStore.init();
  const uid = authStore.user?.uid ?? 'demo-user';
  await Promise.all([
    prefsStore.hydrate(uid, authStore.isDemoMode),
    catalogStore.hydrate(uid, authStore.isDemoMode),
    timeLogsStore.hydrate(uid, authStore.isDemoMode),
  ]);
});

async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const text = await file.text();
  csvText.value = text;
  commitResult.value = null;
  previewStatusFilter.value = 'all';
  preview.value = await buildPreview(text);
}

async function handleRunPreview() {
  commitResult.value = null;
  previewStatusFilter.value = 'all';
  preview.value = await buildPreview(csvText.value);
}

async function handleCommit() {
  if (!preview.value) return;
  const res = await commitPreview(preview.value);
  commitResult.value = res;
  // Refresh row status badges in O(N) without re-parsing or re-hashing
  preview.value = refreshPreview(preview.value);
}

function toggleSummaryStatusFilter(target: TogglRowImportStatus) {
  previewStatusFilter.value = previewStatusFilter.value === target ? 'all' : target;
}

function handleExport() {
  exportCsvDownload();
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border-hairline pb-4">
      <div>
        <h1 class="display-wide text-xl sm:text-2xl text-text-primary">{{ $t('csv.title') }}</h1>
        <p class="mt-1.5 text-sm text-text-muted">{{ $t('csv.subtitle') }}</p>
      </div>

      <button
        type="button"
        data-tour="csv-export-btn"
        class="btn-press inline-flex h-10 items-center gap-2 border border-signal/60 bg-signal-soft px-4 text-xs font-semibold uppercase tracking-wider text-signal hover:bg-accent hover:border-accent hover:text-white transition-colors"
        @click="handleExport"
      >
        <Download class="h-4 w-4" />
        <span>{{ $t('csv.exportButton') }} ({{ timeLogsStore.logs.length }})</span>
      </button>
    </div>

    <!-- Import & Dry-Run Input Card -->
    <div class="relative overflow-hidden border border-border-hairline bg-bg-elevated p-5 sm:p-6 space-y-4">
      <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="label-eyebrow text-signal">
            {{ $t('csv.importSectionTitle') }}
          </h2>
          <p class="mt-1.5 text-sm text-text-muted">
            {{ $t('csv.importSectionDesc') }}
          </p>
        </div>

        <label
          data-tour="csv-upload-input"
          class="btn-press inline-flex h-9 cursor-pointer items-center gap-2 border border-border-hairline bg-bg-primary px-3.5 text-xs font-medium text-text-primary hover:border-signal transition-colors"
        >
          <Upload class="h-4 w-4 text-signal" />
          <span>{{ $t('csv.uploadFileLabel') }}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            class="hidden"
            @change="handleFileUpload"
          />
        </label>
      </div>

      <div>
        <label class="label-eyebrow block text-text-muted mb-2">
          {{ $t('csv.pasteLabel') }}
        </label>
        <textarea
          v-model="csvText"
          rows="6"
          :placeholder="$t('csv.pastePlaceholder')"
          class="w-full border border-border-input bg-bg-primary p-3.5 font-mono text-ui text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
        />
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          :disabled="!csvText.trim() || isParsing"
          class="btn-press inline-flex h-10 items-center gap-2 border border-border-hairline bg-bg-primary px-4 text-xs font-semibold uppercase tracking-wider text-text-primary hover:border-signal disabled:opacity-40 transition-colors"
          @click="handleRunPreview"
        >
          <Play class="h-4 w-4 text-signal" />
          <span class="tabular-telemetry">
            {{
              isParsing
                ? parseProgress
                  ? `${$t('csv.parsing')} (${parseProgress.processed}/${parseProgress.total})`
                  : $t('csv.parsing')
                : $t('csv.previewButton')
            }}
          </span>
        </button>

        <button
          v-if="preview && (preview.newLogsCount > 0 || preview.newProjectNames.length > 0 || preview.newScopedTags.length > 0)"
          type="button"
          :disabled="isCommitting"
          class="btn-press inline-flex h-10 items-center gap-2 bg-accent px-5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-accent-hover disabled:opacity-50"
          @click="handleCommit"
        >
          <FileSpreadsheet class="h-4 w-4" />
          <span class="tabular-telemetry">
            {{
              isCommitting
                ? importProgress
                  ? `${$t('csv.committing')} (${importProgress.completed}/${importProgress.total})`
                  : $t('csv.committing')
                : $t('csv.commitButton')
            }}
          </span>
        </button>
      </div>
    </div>

    <!-- Commit Success Banner -->
    <div
      v-if="commitResult"
      class="flex items-start gap-3 border border-emerald-500/40 bg-emerald-500/10 p-4 text-ui text-emerald-500"
    >
      <CheckCircle2 class="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
      <div>
        <div class="font-semibold uppercase tracking-wider">
          {{ $t('csv.commitSuccessTitle') }}
        </div>
        <p class="mt-1 text-text-primary">
          {{
            t('csv.commitSuccessBody', {
              logs: commitResult.importedLogs,
              projects: commitResult.createdProjects,
              tags: commitResult.createdTags,
              skipped: commitResult.skippedDuplicates,
            })
          }}
        </p>
      </div>
    </div>

    <!-- Preview Results -->
    <div v-if="preview" class="space-y-4">
      <!-- Summary Telemetry Grid -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <button
          type="button"
          data-testid="csv-summary-pending"
          :aria-pressed="previewStatusFilter === 'pending'"
          class="border bg-bg-elevated p-4 text-left transition-colors hover:border-signal"
          :class="previewStatusFilter === 'pending' ? 'border-signal bg-signal-soft/30' : 'border-border-hairline'"
          @click="toggleSummaryStatusFilter('pending')"
        >
          <div class="label-eyebrow text-text-muted">
            {{ $t('csv.summaryNewLogs') }}
          </div>
          <div class="display-wide tabular-telemetry mt-2 text-2xl text-signal">
            {{ preview.newLogsCount }}
          </div>
        </button>

        <button
          type="button"
          data-testid="csv-summary-imported"
          :aria-pressed="previewStatusFilter === 'imported'"
          class="border bg-bg-elevated p-4 text-left transition-colors hover:border-emerald-500/60"
          :class="previewStatusFilter === 'imported' ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-border-hairline'"
          @click="toggleSummaryStatusFilter('imported')"
        >
          <div class="label-eyebrow text-text-muted">
            {{ $t('csv.summaryDuplicates') }}
          </div>
          <div class="display-wide tabular-telemetry mt-2 text-2xl text-text-primary">
            {{ preview.duplicateLogsCount }}
          </div>
        </button>

        <div class="border border-border-hairline bg-bg-elevated p-4">
          <div class="label-eyebrow text-text-muted">
            {{ $t('csv.summaryNewProjects') }}
          </div>
          <div class="display-wide tabular-telemetry mt-2 text-2xl text-emerald-500">
            {{ preview.newProjectNames.length }}
          </div>
        </div>

        <div class="border border-border-hairline bg-bg-elevated p-4">
          <div class="label-eyebrow text-text-muted">
            {{ $t('csv.summaryNewTags') }}
          </div>
          <div class="display-wide tabular-telemetry mt-2 text-2xl text-amber-500">
            {{ preview.newScopedTags.length }}
          </div>
        </div>

        <div class="border border-border-hairline bg-bg-elevated p-4">
          <div class="label-eyebrow text-text-muted">
            {{ $t('csv.summaryErrors') }}
          </div>
          <div
            class="display-wide tabular-telemetry mt-2 text-2xl"
            :class="preview.errors.length > 0 ? 'text-destructive' : 'text-text-muted'"
          >
            {{ preview.errors.length }}
          </div>
        </div>
      </div>

      <!-- New Projects & Project Tags Preview -->
      <div
        v-if="preview.newProjectNames.length > 0 || preview.newScopedTags.length > 0"
        class="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        <div class="border border-border-hairline bg-bg-elevated p-4">
          <div class="label-eyebrow text-text-muted mb-2.5">
            {{ $t('csv.summaryNewProjects') }}
          </div>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="proj in preview.newProjectNames"
              :key="proj"
              class="border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-ui font-medium text-emerald-500"
            >
              + {{ proj }}
            </span>
          </div>
        </div>

        <div class="border border-border-hairline bg-bg-elevated p-4">
          <div class="label-eyebrow text-text-muted mb-2.5">
            {{ $t('csv.summaryNewTags') }}
          </div>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="st in preview.newScopedTags"
              :key="`${st.projectName}::${st.tagName}`"
              class="border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-ui font-medium text-amber-500"
            >
              {{ st.projectName }} → {{ st.tagName }}
            </span>
          </div>
        </div>
      </div>

      <!-- Validation Errors -->
      <div
        v-if="preview.errors.length > 0"
        class="border border-destructive/50 bg-destructive/10 p-4 space-y-2"
      >
        <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-destructive">
          <AlertTriangle class="h-4 w-4" />
          <span>{{ $t('csv.summaryErrors') }} ({{ preview.errors.length }})</span>
        </div>
        <ul class="space-y-1 text-ui text-destructive">
          <li v-for="err in preview.errors.slice(0, 50)" :key="err.rowNumber">
            {{ t(`csv.errors.${err.code}`, { row: err.rowNumber }) }}
          </li>
        </ul>
        <p v-if="preview.errors.length > 50" class="tabular-telemetry text-xs text-destructive/80">
          {{ $t('csv.errorsOverflow', { count: preview.errors.length - 50 }) }}
        </p>
      </div>

      <!-- Paginated & Column-Filterable Preview Table -->
      <CsvTogglPreviewTable
        v-if="preview.logRows.length > 0"
        v-model:status-filter="previewStatusFilter"
        :rows="preview.logRows"
      />
    </div>
  </div>
</template>
