<script setup lang="ts">
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Play } from 'lucide-vue-next';
import { formatHMS } from '~/domain/duration';
import type { TogglDryRunPreview } from '~/domain/toggl';
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
const { isCommitting, importProgress, buildPreview, commitPreview, exportCsvDownload } = useTogglCsv();

const csvText = ref('');
const preview = ref<TogglDryRunPreview | null>(null);
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
  preview.value = await buildPreview(text);
}

async function handleRunPreview() {
  commitResult.value = null;
  preview.value = await buildPreview(csvText.value);
}

async function handleCommit() {
  if (!preview.value) return;
  const res = await commitPreview(preview.value);
  commitResult.value = res;
  // Re-run preview so the user immediately sees idempotent 0 new logs / all duplicates
  preview.value = await buildPreview(csvText.value);
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
        <h1 class="text-xl font-semibold tracking-tight text-text-primary">{{ $t('csv.title') }}</h1>
        <p class="mt-1 text-sm text-text-muted">{{ $t('csv.subtitle') }}</p>
      </div>

      <button
        type="button"
        data-tour="csv-export-btn"
        class="inline-flex h-10 items-center gap-2 border border-signal/60 bg-signal-soft px-4 text-xs font-mono font-semibold uppercase tracking-wider text-signal hover:bg-accent hover:border-accent hover:text-white transition-colors"
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
          <h2 class="label-mono text-signal">
            {{ $t('csv.importSectionTitle') }}
          </h2>
          <p class="mt-1.5 text-sm text-text-muted">
            {{ $t('csv.importSectionDesc') }}
          </p>
        </div>

        <label
          data-tour="csv-upload-input"
          class="inline-flex h-9 cursor-pointer items-center gap-2 border border-border-hairline bg-bg-primary px-3.5 text-xs font-mono text-text-primary hover:border-signal transition-colors"
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
        <label class="label-mono block text-text-muted mb-2">
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
          :disabled="!csvText.trim()"
          class="inline-flex h-10 items-center gap-2 border border-border-hairline bg-bg-primary px-4 text-xs font-mono uppercase tracking-wider text-text-primary hover:border-signal disabled:opacity-40 transition-colors"
          @click="handleRunPreview"
        >
          <Play class="h-4 w-4 text-signal" />
          <span>{{ $t('csv.previewButton') }}</span>
        </button>

        <button
          v-if="preview && (preview.newLogsCount > 0 || preview.newProjectNames.length > 0 || preview.newScopedTags.length > 0)"
          type="button"
          :disabled="isCommitting"
          class="inline-flex h-10 items-center gap-2 bg-accent px-5 text-xs font-mono font-semibold uppercase tracking-wider text-white hover:bg-accent-hover disabled:opacity-50"
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
        <div class="font-mono font-semibold uppercase tracking-wider">
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
        <div class="border border-border-hairline bg-bg-elevated p-4">
          <div class="label-mono text-text-muted">
            {{ $t('csv.summaryNewLogs') }}
          </div>
          <div class="tabular-telemetry mt-2 font-mono text-2xl font-semibold text-signal">
            {{ preview.newLogsCount }}
          </div>
        </div>

        <div class="border border-border-hairline bg-bg-elevated p-4">
          <div class="label-mono text-text-muted">
            {{ $t('csv.summaryDuplicates') }}
          </div>
          <div class="tabular-telemetry mt-2 font-mono text-2xl font-semibold text-text-primary">
            {{ preview.duplicateLogsCount }}
          </div>
        </div>

        <div class="border border-border-hairline bg-bg-elevated p-4">
          <div class="label-mono text-text-muted">
            {{ $t('csv.summaryNewProjects') }}
          </div>
          <div class="tabular-telemetry mt-2 font-mono text-2xl font-semibold text-emerald-500">
            {{ preview.newProjectNames.length }}
          </div>
        </div>

        <div class="border border-border-hairline bg-bg-elevated p-4">
          <div class="label-mono text-text-muted">
            {{ $t('csv.summaryNewTags') }}
          </div>
          <div class="tabular-telemetry mt-2 font-mono text-2xl font-semibold text-amber-500">
            {{ preview.newScopedTags.length }}
          </div>
        </div>

        <div class="border border-border-hairline bg-bg-elevated p-4">
          <div class="label-mono text-text-muted">
            {{ $t('csv.summaryErrors') }}
          </div>
          <div
            class="tabular-telemetry mt-2 font-mono text-2xl font-semibold"
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
          <div class="label-mono text-text-muted mb-2.5">
            {{ $t('csv.summaryNewProjects') }}
          </div>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="proj in preview.newProjectNames"
              :key="proj"
              class="border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 font-mono text-ui text-emerald-500"
            >
              + {{ proj }}
            </span>
          </div>
        </div>

        <div class="border border-border-hairline bg-bg-elevated p-4">
          <div class="label-mono text-text-muted mb-2.5">
            {{ $t('csv.summaryNewTags') }}
          </div>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="st in preview.newScopedTags"
              :key="`${st.projectName}::${st.tagName}`"
              class="border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 font-mono text-ui text-amber-500"
            >
              {{ st.projectName }} → #{{ st.tagName }}
            </span>
          </div>
        </div>
      </div>

      <!-- Validation Errors -->
      <div
        v-if="preview.errors.length > 0"
        class="border border-destructive/50 bg-destructive/10 p-4 space-y-2"
      >
        <div class="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-destructive">
          <AlertTriangle class="h-4 w-4" />
          <span>{{ $t('csv.summaryErrors') }} ({{ preview.errors.length }})</span>
        </div>
        <ul class="space-y-1 font-mono text-ui text-destructive">
          <li v-for="err in preview.errors" :key="err.rowNumber">
            {{ t(`csv.errors.${err.code}`, { row: err.rowNumber }) }}
          </li>
        </ul>
      </div>

      <!-- Parsed Rows Preview Table -->
      <div
        v-if="preview.logRows.length > 0"
        class="relative overflow-hidden border border-border-hairline bg-bg-elevated overflow-x-auto"
      >
        <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
        <table class="w-full text-left text-sm">
          <thead class="border-b border-border-hairline bg-bg-primary text-xs font-mono uppercase text-text-muted">
            <tr>
              <th class="px-4 py-3">#</th>
              <th class="px-4 py-3">{{ $t('dashboard.colDate') }}</th>
              <th class="px-4 py-3">{{ $t('dashboard.colDescription') }}</th>
              <th class="px-4 py-3">{{ $t('dashboard.colProject') }}</th>
              <th class="px-4 py-3">{{ $t('dashboard.colTags') }}</th>
              <th class="px-4 py-3 text-right">{{ $t('dashboard.colDuration') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-hairline">
            <tr
              v-for="row in preview.logRows.slice(0, 50)"
              :key="row.deterministicId"
              class="hover:bg-bg-hover"
            >
              <td class="tabular-telemetry px-4 py-2.5 font-mono text-ui text-text-muted">
                {{ row.rowNumber }}
              </td>
              <td class="tabular-telemetry px-4 py-2.5 font-mono text-ui text-text-muted whitespace-nowrap">
                {{ row.startDateKey }}
              </td>
              <td class="px-4 py-2.5 font-medium text-text-primary">
                {{ row.description }}
              </td>
              <td class="px-4 py-2.5 font-mono text-ui text-text-muted">
                {{ row.projectName || $t('catalog.unassigned') }}
              </td>
              <td class="px-4 py-2.5">
                <div class="flex flex-wrap gap-1.5">
                  <span
                    v-for="tag in row.tagNames"
                    :key="tag"
                    class="border border-border-hairline bg-bg-primary px-2 py-0.5 font-mono text-xs text-text-muted"
                  >
                    #{{ tag }}
                  </span>
                </div>
              </td>
              <td class="tabular-telemetry px-4 py-2.5 text-right font-mono font-semibold text-text-primary">
                {{ formatHMS(row.durationSeconds) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
