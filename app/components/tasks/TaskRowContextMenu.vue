<script setup lang="ts">
import {
  CheckCircle2,
  CheckSquare,
  Circle,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  IndentDecrease,
  IndentIncrease,
  Pencil,
  Plus,
  SlidersHorizontal,
  Table,
  Trash2,
} from 'lucide-vue-next';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuRoot,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from 'reka-ui';

const props = withDefaults(
  defineProps<{
    taskName: string;
    depth?: number;
    selected?: boolean;
    selectedCount?: number;
    canAddSubtask?: boolean;
    canIndent?: boolean;
    canOutdent?: boolean;
    externalUrl?: string | null;
  }>(),
  {
    depth: 0,
    selected: false,
    selectedCount: 0,
    canAddSubtask: false,
    canIndent: false,
    canOutdent: false,
    externalUrl: null,
  }
);

const emit = defineEmits<{
  prepareContextMenu: [];
  openDetails: [];
  renameInline: [];
  addSubtask: [];
  duplicate: [];
  toggleSelect: [];
  indent: [];
  outdent: [];
  exportMarkdown: [];
  exportCsv: [];
  bulkMarkDone: [];
  bulkMarkTodo: [];
  delete: [];
  bulkDelete: [];
}>();

const open = ref(false);
const isBulkMode = computed(() => props.selectedCount > 1 && props.selected);

function handleUpdateOpen(nextOpen: boolean) {
  if (nextOpen) {
    emit('prepareContextMenu');
  }
  open.value = nextOpen;
}
</script>

<template>
  <ContextMenuRoot :open="open" @update:open="handleUpdateOpen">
    <ContextMenuTrigger as-child>
      <slot />
    </ContextMenuTrigger>

    <ContextMenuPortal>
      <ContextMenuContent
        :collision-padding="12"
        data-testid="task-row-context-menu"
        class="orbital-popover relative z-50 w-60 overflow-hidden border border-border-hairline bg-bg-elevated p-1 shadow-2xl focus:outline-none"
        @click.stop
      >
        <div class="signal-line -mx-1 -mt-1 mb-1" aria-hidden="true" />

        <!-- Multi-Selection Bulk Mode -->
        <template v-if="isBulkMode">
          <ContextMenuLabel class="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-signal tabular-telemetry">
            {{ $t('tasks.contextMenu.bulkHeader', { count: selectedCount }) }}
          </ContextMenuLabel>

          <ContextMenuItem as-child @select="emit('exportMarkdown')">
            <button
              type="button"
              data-testid="task-context-bulk-markdown"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <Table class="h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
              <span>{{ $t('tasks.contextMenu.bulkCopyMarkdown') }}</span>
            </button>
          </ContextMenuItem>

          <ContextMenuItem as-child @select="emit('exportCsv')">
            <button
              type="button"
              data-testid="task-context-bulk-csv"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <FileSpreadsheet class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>{{ $t('tasks.contextMenu.bulkExportCsv') }}</span>
            </button>
          </ContextMenuItem>

          <ContextMenuItem as-child @select="emit('duplicate')">
            <button
              type="button"
              data-testid="task-context-bulk-duplicate"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <Copy class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>{{ $t('tasks.contextMenu.duplicate') }}</span>
              <span class="ml-auto text-xs text-text-faint" aria-hidden="true">⌘D</span>
            </button>
          </ContextMenuItem>

          <ContextMenuSeparator as="hr" class="my-1 border-border-hairline" />

          <ContextMenuItem as-child @select="emit('bulkMarkDone')">
            <button
              type="button"
              data-testid="task-context-bulk-done"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <CheckCircle2 class="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
              <span>{{ $t('tasks.contextMenu.bulkMarkDone') }}</span>
            </button>
          </ContextMenuItem>

          <ContextMenuItem as-child @select="emit('bulkMarkTodo')">
            <button
              type="button"
              data-testid="task-context-bulk-todo"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <Circle class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>{{ $t('tasks.contextMenu.bulkMarkTodo') }}</span>
            </button>
          </ContextMenuItem>

          <ContextMenuSeparator as="hr" class="my-1 border-border-hairline" />

          <ContextMenuItem as-child @select="emit('bulkDelete')">
            <button
              type="button"
              data-testid="task-context-bulk-delete"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-destructive transition-colors hover:bg-destructive/10 focus:bg-destructive/10 focus:outline-none data-[highlighted]:bg-destructive/10"
            >
              <Trash2 class="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{{ $t('tasks.selection.deleteSelected', { count: selectedCount }) }}</span>
              <span class="ml-auto text-xs text-destructive/75" aria-hidden="true">Del</span>
            </button>
          </ContextMenuItem>
        </template>

        <!-- Single-Task Context Menu -->
        <template v-else>
          <ContextMenuItem as-child @select="emit('openDetails')">
            <button
              type="button"
              data-testid="task-context-open-details"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <SlidersHorizontal class="h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
              <span>{{ $t('tasks.rowMenu.openDetails') }}</span>
              <span class="ml-auto text-xs text-text-faint" aria-hidden="true">Enter</span>
            </button>
          </ContextMenuItem>

          <ContextMenuItem as-child @select="emit('renameInline')">
            <button
              type="button"
              data-testid="task-context-rename"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <Pencil class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>{{ $t('tasks.contextMenu.renameInline') }}</span>
              <span class="ml-auto text-xs text-text-faint" aria-hidden="true">F2</span>
            </button>
          </ContextMenuItem>

          <ContextMenuItem
            v-if="canAddSubtask"
            as-child
            @select="emit('addSubtask')"
          >
            <button
              type="button"
              data-testid="task-context-add-subtask"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <Plus class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>
                {{ (depth ?? 0) === 0 ? $t('catalog.addSubtask') : $t('catalog.addSubSubtask') }}
              </span>
              <span class="ml-auto text-xs text-text-faint" aria-hidden="true">⇧Enter</span>
            </button>
          </ContextMenuItem>

          <ContextMenuItem as-child @select="emit('duplicate')">
            <button
              type="button"
              data-testid="task-context-duplicate"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <Copy class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>{{ $t('tasks.contextMenu.duplicate') }}</span>
              <span class="ml-auto text-xs text-text-faint" aria-hidden="true">⌘D</span>
            </button>
          </ContextMenuItem>

          <ContextMenuItem as-child @select="emit('toggleSelect')">
            <button
              type="button"
              data-testid="task-context-toggle-select"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <CheckSquare class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>
                {{ selected ? $t('tasks.rowMenu.deselectItem') : $t('tasks.rowMenu.selectItem') }}
              </span>
            </button>
          </ContextMenuItem>

          <ContextMenuItem
            v-if="canIndent"
            as-child
            @select="emit('indent')"
          >
            <button
              type="button"
              data-testid="task-context-indent"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <IndentIncrease class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>{{ $t('tasks.rowMenu.indent') }}</span>
              <span class="ml-auto text-xs text-text-faint" aria-hidden="true">⌘]</span>
            </button>
          </ContextMenuItem>

          <ContextMenuItem
            v-if="canOutdent"
            as-child
            @select="emit('outdent')"
          >
            <button
              type="button"
              data-testid="task-context-outdent"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <IndentDecrease class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>{{ $t('tasks.rowMenu.outdent') }}</span>
              <span class="ml-auto text-xs text-text-faint" aria-hidden="true">⌘[</span>
            </button>
          </ContextMenuItem>

          <ContextMenuSeparator as="hr" class="my-1 border-border-hairline" />

          <ContextMenuItem v-if="externalUrl" as-child>
            <a
              :href="externalUrl"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="task-context-open-ado"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-signal transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <ExternalLink class="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{{ $t('tasks.rowMenu.openInAdo') }}</span>
              <span class="ml-auto text-xs text-text-faint" aria-hidden="true">↗</span>
            </a>
          </ContextMenuItem>

          <ContextMenuItem as-child @select="emit('exportMarkdown')">
            <button
              type="button"
              data-testid="task-context-copy-markdown"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <Table class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>{{ $t('tasks.contextMenu.copyMarkdown') }}</span>
            </button>
          </ContextMenuItem>

          <ContextMenuItem as-child @select="emit('exportCsv')">
            <button
              type="button"
              data-testid="task-context-export-csv"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <Download class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>{{ $t('tasks.contextMenu.exportCsv') }}</span>
            </button>
          </ContextMenuItem>

          <ContextMenuSeparator as="hr" class="my-1 border-border-hairline" />

          <ContextMenuItem as-child @select="emit('delete')">
            <button
              type="button"
              data-testid="task-context-delete"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-destructive transition-colors hover:bg-destructive/10 focus:bg-destructive/10 focus:outline-none data-[highlighted]:bg-destructive/10"
            >
              <Trash2 class="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{{ $t('confirm.deleteAction') }}</span>
              <span class="ml-auto text-xs text-destructive/75" aria-hidden="true">Del</span>
            </button>
          </ContextMenuItem>
        </template>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>
