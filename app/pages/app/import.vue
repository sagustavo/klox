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
const { isCommitting, buildPreview, commitPreview, exportCsvDownload } = useTogglCsv();

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
        <h1 class="text-lg font-semibold tracking-tight">{{ $t('csv.title') }}</h1>
        <p class="mt-0.5 text-xs text-text-muted">{{ $t('csv.subtitle') }}</p>
      </div>

      <button
        type="button"
        data-tour="csv-export-btn"
        class="inline-flex h-9 items-center gap-2 border border-accent bg-accent/10 px-4 text-xs font-mono uppercase tracking-wider text-accent hover:bg-accent hover:text-white transition-colors"
        @click="handleExport"
      >
        <Download class="h-3.5 w-3.5" />
        <span>{{ $t('csv.exportButton') }} ({{ timeLogsStore.logs.length }})</span>
      </button>
    </div>

    <!-- Import & Dry-Run Input Card -->
    <div class="border border-border-hairline bg-bg-elevated p-4 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 class="text-xs font-mono uppercase tracking-wider text-text-muted">
            {{ $t('csv.importSectionTitle') }}
          </h2>
          <p class="mt-0.5 text-xs text-text-muted">
            {{ $t('csv.importSectionDesc') }}
          </p>
        </div>

        <label
          data-tour="csv-upload-input"
          class="inline-flex h-8 cursor-pointer items-center gap-1.5 border border-border-hairline bg-bg-primary px-3 text-xs font-mono text-text-primary hover:border-accent transition-colors"
        >
          <Upload class="h-3.5 w-3.5 text-accent" />
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
        <label class="block text-[11px] font-mono uppercase text-text-muted mb-1.5">
          {{ $t('csv.pasteLabel') }}
        </label>
        <textarea
          v-model="csvText"
          rows="6"
          :placeholder="$t('csv.pastePlaceholder')"
          class="w-full border border-border-hairline bg-bg-primary p-3 font-mono text-xs text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
        />
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          :disabled="!csvText.trim()"
          class="inline-flex h-9 items-center gap-1.5 border border-border-hairline bg-bg-primary px-4 text-xs font-mono uppercase tracking-wider text-text-primary hover:border-accent disabled:opacity-40 transition-colors"
          @click="handleRunPreview"
        >
          <Play class="h-3.5 w-3.5 text-accent" />
          <span>{{ $t('csv.previewButton') }}</span>
        </button>

        <button
          v-if="preview && (preview.newLogsCount > 0 || preview.newProjectNames.length > 0 || preview.newScopedTags.length > 0)"
          type="button"
          :disabled="isCommitting"
          class="inline-flex h-9 items-center gap-2 bg-accent px-5 text-xs font-mono font-semibold uppercase tracking-wider text-white hover:bg-accent/90 disabled:opacity-50"
          @click="handleCommit"
        >
          <FileSpreadsheet class="h-3.5 w-3.5" />
          <span>{{ isCommitting ? $t('csv.committing') : $t('csv.commitButton') }}</span>
        </button>
      </div>
    </div>

    <!-- Commit Success Banner -->
    <div
      v-if="commitResult"
      class="flex items-start gap-3 border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs text-emerald-300"
    >
      <CheckCircle2 class="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
      <div>
        <div class="font-mono font-semibold uppercase tracking-wider">
          {{ $t('csv.commitSuccessTitle') }}
        </div>
        <p class="mt-0.5">
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

    <!-- Dry-Run Preview Results -->
    <div v-if="preview" class="space-y-4">
      <!-- Summary Telemetry Grid -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div class="border border-border-hairline bg-bg-elevated p-3">
          <div class="text-[10px] font-mono uppercase text-text-muted">
            {{ $t('csv.summaryNewLogs') }}
          </div>
          <div class="tabular-telemetry mt-1 font-mono text-xl font-semibold text-accent">
            {{ preview.newLogsCount }}
          </div>
        </div>

        <div class="border border-border-hairline bg-bg-elevated p-3">
          <div class="text-[10px] font-mono uppercase text-text-muted">
            {{ $t('csv.summaryDuplicates') }}
          </div>
          <div class="tabular-telemetry mt-1 font-mono text-xl font-semibold text-text-primary">
            {{ preview.duplicateLogsCount }}
          </div>
        </div>

        <div class="border border-border-hairline bg-bg-elevated p-3">
          <div class="text-[10px] font-mono uppercase text-text-muted">
            {{ $t('csv.summaryNewProjects') }}
          </div>
          <div class="tabular-telemetry mt-1 font-mono text-xl font-semibold text-emerald-400">
            {{ preview.newProjectNames.length }}
          </div>
        </div>

        <div class="border border-border-hairline bg-bg-elevated p-3">
          <div class="text-[10px] font-mono uppercase text-text-muted">
            {{ $t('csv.summaryNewTags') }}
          </div>
          <div class="tabular-telemetry mt-1 font-mono text-xl font-semibold text-amber-400">
            {{ preview.newScopedTags.length }}
          </div>
        </div>

        <div class="border border-border-hairline bg-bg-elevated p-3">
          <div class="text-[10px] font-mono uppercase text-text-muted">
            {{ $t('csv.summaryErrors') }}
          </div>
          <div
            class="tabular-telemetry mt-1 font-mono text-xl font-semibold"
            :class="preview.errors.length > 0 ? 'text-red-400' : 'text-text-muted'"
          >
            {{ preview.errors.length }}
          </div>
        </div>
      </div>

      <!-- New Projects & Project-Scoped Tags Preview -->
      <div
        v-if="preview.newProjectNames.length > 0 || preview.newScopedTags.length > 0"
        class="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        <div class="border border-border-hairline bg-bg-elevated p-4">
          <div class="text-xs font-mono uppercase tracking-wider text-text-muted mb-2">
            {{ $t('csv.summaryNewProjects') }}
          </div>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="proj in preview.newProjectNames"
              :key="proj"
              class="border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-xs text-emerald-300"
            >
              + {{ proj }}
            </span>
          </div>
        </div>

        <div class="border border-border-hairline bg-bg-elevated p-4">
          <div class="text-xs font-mono uppercase tracking-wider text-text-muted mb-2">
            {{ $t('csv.summaryNewTags') }}
          </div>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="st in preview.newScopedTags"
              :key="`${st.projectName}::${st.tagName}`"
              class="border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-xs text-amber-300"
            >
              {{ st.projectName }} → #{{ st.tagName }}
            </span>
          </div>
        </div>
      </div>

      <!-- Validation Errors -->
      <div
        v-if="preview.errors.length > 0"
        class="border border-red-500/40 bg-red-500/10 p-4 space-y-1.5"
      >
        <div class="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-red-400">
          <AlertTriangle class="h-3.5 w-3.5" />
          <span>{{ $t('csv.summaryErrors') }} ({{ preview.errors.length }})</span>
        </div>
        <ul class="space-y-1 font-mono text-xs text-red-300">
          <li v-for="err in preview.errors" :key="err.rowNumber">
            {{ t(`csv.errors.${err.code}`, { row: err.rowNumber }) }}
          </li>
        </ul>
      </div>

      <!-- Parsed Rows Preview Table -->
      <div
        v-if="preview.logRows.length > 0"
        class="border border-border-hairline bg-bg-elevated overflow-x-auto"
      >
        <table class="w-full text-left text-xs">
          <thead class="border-b border-border-hairline bg-bg-primary text-[11px] font-mono uppercase text-text-muted">
            <tr>
              <th class="px-4 py-2.5">#</th>
              <th class="px-4 py-2.5">{{ $t('dashboard.colDate') }}</th>
              <th class="px-4 py-2.5">{{ $t('dashboard.colDescription') }}</th>
              <th class="px-4 py-2.5">{{ $t('dashboard.colProject') }}</th>
              <th class="px-4 py-2.5">{{ $t('dashboard.colTags') }}</th>
              <th class="px-4 py-2.5 text-right">{{ $t('dashboard.colDuration') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-hairline">
            <tr
              v-for="row in preview.logRows.slice(0, 50)"
              :key="row.deterministicId"
              class="hover:bg-bg-hover"
            >
              <td class="tabular-telemetry px-4 py-2 font-mono text-text-muted">
                {{ row.rowNumber }}
              </td>
              <td class="tabular-telemetry px-4 py-2 font-mono text-text-muted whitespace-nowrap">
                {{ row.startDateKey }}
              </td>
              <td class="px-4 py-2 font-medium text-text-primary">
                {{ row.description }}
              </td>
              <td class="px-4 py-2 font-mono text-text-muted">
                {{ row.projectName || $t('catalog.unassigned') }}
              </td>
              <td class="px-4 py-2">
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="tag in row.tagNames"
                    :key="tag"
                    class="border border-border-hairline bg-bg-primary px-1.5 py-0.5 font-mono text-[10px] text-text-muted"
                  >
                    #{{ tag }}
                  </span>
                </div>
              </td>
              <td class="tabular-telemetry px-4 py-2 text-right font-mono font-medium">
                {{ formatHMS(row.durationSeconds) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
