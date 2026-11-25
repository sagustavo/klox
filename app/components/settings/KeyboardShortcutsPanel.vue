<script setup lang="ts">
import { AlertTriangle, Keyboard, Pencil, RotateCcw, Search, X } from 'lucide-vue-next';
import { captureShortcutFromEvent } from '~/domain/shortcuts';
import type { ShortcutCommandId } from '~/domain/types';

const emit = defineEmits<{
  saved: [];
}>();

const { t } = useI18n();
const {
  commands,
  conflictCount,
  hasCustomOverrides,
  isRecording,
  getKeycaps,
  getFormattedText,
  isCustomized,
  getConflictsFor,
  setShortcut,
  resetShortcut,
  resetAllShortcuts,
} = useShortcuts();

const searchQuery = ref('');
const recordingCommandId = ref<ShortcutCommandId | null>(null);
const recordError = ref<string | null>(null);

const filteredCommands = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return commands;
  return commands.filter((cmd) => {
    const title = t(`shortcuts.commands.${cmd.id}.title`).toLowerCase();
    const desc = t(`shortcuts.commands.${cmd.id}.desc`).toLowerCase();
    const binding = getFormattedText(cmd.id).toLowerCase();
    return (
      cmd.id.toLowerCase().includes(q) ||
      title.includes(q) ||
      desc.includes(q) ||
      binding.includes(q)
    );
  });
});

function stopRecording() {
  if (import.meta.client) {
    window.removeEventListener('keydown', handleRecordKeydown, true);
  }
  recordingCommandId.value = null;
  isRecording.value = false;
}

async function handleRecordKeydown(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();

  if (event.key === 'Escape') {
    recordError.value = null;
    stopRecording();
    return;
  }

  const captured = captureShortcutFromEvent(event);
  if (!captured) {
    recordError.value = t('shortcuts.invalidKeyHint');
    return;
  }

  const targetId = recordingCommandId.value;
  stopRecording();
  recordError.value = null;
  if (targetId) {
    await setShortcut(targetId, captured);
    emit('saved');
  }
}

function startRecording(id: ShortcutCommandId) {
  stopRecording();
  recordingCommandId.value = id;
  isRecording.value = true;
  recordError.value = null;
  if (import.meta.client) {
    window.addEventListener('keydown', handleRecordKeydown, true);
  }
}

async function handleResetCommand(id: ShortcutCommandId) {
  if (recordingCommandId.value === id) {
    stopRecording();
  }
  await resetShortcut(id);
  emit('saved');
}

async function handleResetAll() {
  stopRecording();
  recordError.value = null;
  await resetAllShortcuts();
  emit('saved');
}

onBeforeUnmount(() => {
  stopRecording();
});
</script>

<template>
  <section
    aria-labelledby="settings-shortcuts-heading"
    class="relative overflow-hidden border border-border-hairline bg-bg-elevated p-6 space-y-5"
  >
    <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />

    <!-- Header & Reset All -->
    <div class="flex flex-wrap items-start justify-between gap-3 border-b border-border-hairline pb-4">
      <div class="space-y-1">
        <h2
          id="settings-shortcuts-heading"
          class="display-wide flex items-center gap-2 text-lg sm:text-xl text-text-primary"
        >
          <Keyboard class="h-5 w-5 text-signal" aria-hidden="true" />
          <span>{{ $t('shortcuts.title') }}</span>
        </h2>
        <p class="text-sm text-text-muted">
          {{ $t('shortcuts.subtitle') }}
        </p>
      </div>

      <button
        type="button"
        data-testid="shortcuts-reset-all"
        :disabled="!hasCustomOverrides"
        class="btn-press inline-flex h-9 items-center gap-1.5 border border-border-hairline bg-bg-primary px-3 text-xs font-medium uppercase tracking-wider text-text-muted hover:border-signal hover:text-text-primary disabled:opacity-40 transition-colors"
        @click="handleResetAll"
      >
        <RotateCcw class="h-3.5 w-3.5" aria-hidden="true" />
        <span>{{ $t('shortcuts.resetAll') }}</span>
      </button>
    </div>

    <!-- Search & Global Conflict Banner -->
    <div class="space-y-3">
      <div class="relative">
        <Search
          class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <input
          v-model="searchQuery"
          type="text"
          data-testid="shortcuts-search-input"
          :aria-label="$t('shortcuts.searchLabel')"
          :placeholder="$t('shortcuts.searchPlaceholder')"
          class="h-10 w-full border border-border-input bg-bg-primary pl-9 pr-9 text-sm text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
        />
        <button
          v-if="searchQuery"
          type="button"
          :aria-label="$t('shortcuts.clearSearch')"
          class="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
          @click="searchQuery = ''"
        >
          <X class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div
        v-if="conflictCount > 0"
        data-testid="shortcuts-conflict-banner"
        role="alert"
        class="flex items-center gap-2.5 border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-ui text-amber-500"
      >
        <AlertTriangle class="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{{ $t('shortcuts.conflictBanner') }}</span>
      </div>

      <div
        v-if="recordError"
        role="status"
        class="border border-border-hairline bg-bg-primary px-3.5 py-2 text-ui text-text-muted"
      >
        {{ recordError }}
      </div>
    </div>

    <!-- VS Code-Style Keybindings Table -->
    <div
      tabindex="0"
      role="region"
      :aria-label="$t('shortcuts.tableAria')"
      class="max-h-[520px] overflow-auto border border-border-hairline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-signal"
    >
      <table class="w-full border-separate border-spacing-0 text-left text-sm">
        <caption class="sr-only">
          {{ $t('shortcuts.title') }}
        </caption>
        <thead class="sticky top-0 z-10 bg-bg-primary text-xs font-medium uppercase tracking-wider text-text-muted">
          <tr>
            <th scope="col" class="border-b border-border-hairline bg-bg-primary px-4 py-2.5">
              {{ $t('shortcuts.colCommand') }}
            </th>
            <th scope="col" class="border-b border-border-hairline bg-bg-primary px-4 py-2.5 whitespace-nowrap">
              {{ $t('shortcuts.colKeybinding') }}
            </th>
            <th scope="col" class="border-b border-border-hairline bg-bg-primary px-4 py-2.5 whitespace-nowrap">
              {{ $t('shortcuts.colSource') }}
            </th>
            <th scope="col" class="border-b border-border-hairline bg-bg-primary px-4 py-2.5 text-right whitespace-nowrap">
              {{ $t('shortcuts.colActions') }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border-hairline">
          <tr v-if="filteredCommands.length === 0">
            <td colspan="4" class="px-4 py-6 text-center text-ui text-text-muted">
              {{ $t('shortcuts.noMatches', { query: searchQuery }) }}
            </td>
          </tr>

          <tr
            v-for="cmd in filteredCommands"
            :key="cmd.id"
            :data-testid="`shortcut-row-${cmd.id}`"
            class="hover:bg-bg-hover/50 transition-colors"
          >
            <td class="border-b border-border-subtle px-4 py-3 align-top">
              <div class="font-medium text-text-primary">
                {{ $t(`shortcuts.commands.${cmd.id}.title`) }}
              </div>
              <p class="mt-0.5 text-ui text-text-muted">
                {{ $t(`shortcuts.commands.${cmd.id}.desc`) }}
              </p>
              <div class="mt-1 flex flex-wrap items-center gap-2">
                <code class="font-mono text-xs text-text-faint">
                  {{ cmd.id }}
                </code>
                <span
                  v-if="getConflictsFor(cmd.id).length > 0"
                  :data-testid="`shortcut-conflict-${cmd.id}`"
                  class="inline-flex items-center gap-1 border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500"
                >
                  <AlertTriangle class="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>
                    {{
                      $t('shortcuts.conflictBadge', {
                        other: getConflictsFor(cmd.id)
                          .map((peer) => $t(`shortcuts.commands.${peer}.title`))
                          .join(', '),
                      })
                    }}
                  </span>
                </span>
              </div>
            </td>

            <td class="border-b border-border-subtle px-4 py-3 whitespace-nowrap align-middle">
              <button
                type="button"
                :data-testid="`shortcut-edit-${cmd.id}`"
                class="btn-press inline-flex min-h-[32px] items-center gap-2 border px-2.5 py-1 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                :class="
                  recordingCommandId === cmd.id
                    ? 'border-signal bg-signal-soft text-signal motion-safe:animate-pulse'
                    : 'border-transparent hover:border-border-hairline hover:bg-bg-primary'
                "
                :aria-label="
                  recordingCommandId === cmd.id
                    ? $t('shortcuts.recordingPrompt')
                    : $t('shortcuts.editAria', { command: $t(`shortcuts.commands.${cmd.id}.title`) })
                "
                @click="startRecording(cmd.id)"
              >
                <span v-if="recordingCommandId === cmd.id" class="text-xs font-medium">
                  {{ $t('shortcuts.recordingPrompt') }}
                </span>
                <BrandKeycapBadge v-else :keys="getKeycaps(cmd.id)" size="sm" />
              </button>
            </td>

            <td class="border-b border-border-subtle px-4 py-3 whitespace-nowrap align-middle">
              <span
                class="inline-flex border px-2 py-0.5 text-xs font-medium uppercase tracking-wider"
                :class="
                  isCustomized(cmd.id)
                    ? 'border-signal/40 bg-signal-soft text-signal'
                    : 'border-border-hairline bg-bg-primary text-text-muted'
                "
              >
                {{
                  isCustomized(cmd.id)
                    ? $t('shortcuts.sourceUser')
                    : $t('shortcuts.sourceDefault')
                }}
              </span>
            </td>

            <td class="border-b border-border-subtle px-4 py-3 whitespace-nowrap text-right align-middle">
              <div class="inline-flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  class="btn-press inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:border-signal hover:text-signal transition-colors"
                  :aria-label="$t('shortcuts.editAria', { command: $t(`shortcuts.commands.${cmd.id}.title`) })"
                  :title="$t('shortcuts.editButton')"
                  @click="startRecording(cmd.id)"
                >
                  <Pencil class="h-3.5 w-3.5" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  :data-testid="`shortcut-reset-${cmd.id}`"
                  :disabled="!isCustomized(cmd.id)"
                  class="btn-press inline-flex h-8 w-8 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:border-signal hover:text-text-primary disabled:opacity-35 transition-colors"
                  :aria-label="$t('shortcuts.resetAria', { command: $t(`shortcuts.commands.${cmd.id}.title`) })"
                  :title="$t('shortcuts.resetButton')"
                  @click="handleResetCommand(cmd.id)"
                >
                  <RotateCcw class="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
