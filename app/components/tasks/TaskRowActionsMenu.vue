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
  MoreVertical,
  Pencil,
  Plus,
  SlidersHorizontal,
  Table,
  Trash2,
} from 'lucide-vue-next';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
    testId?: string;
  }>(),
  {
    depth: 0,
    selected: false,
    selectedCount: 0,
    canAddSubtask: false,
    canIndent: false,
    canOutdent: false,
    externalUrl: null,
    testId: undefined,
  }
);

const emit = defineEmits<{
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

const isBulkMode = computed(() => props.selectedCount > 1 && props.selected);
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <button
        type="button"
        :data-testid="testId ?? 'task-row-menu-trigger'"
        :aria-label="$t('tasks.rowMenu.triggerAria', { name: taskName })"
        :title="$t('tasks.rowMenu.triggerAria', { name: taskName })"
        class="row-action-ghost"
        @pointerdown.stop
        @click.stop
      >
        <MoreVertical class="h-4 w-4" aria-hidden="true" />
      </button>
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        align="end"
        :side-offset="6"
        :collision-padding="12"
        class="orbital-popover relative z-50 w-60 overflow-hidden border border-border-hairline bg-bg-elevated p-1 shadow-2xl focus:outline-none"
        @click.stop
      >
        <div class="signal-line -mx-1 -mt-1 mb-1" aria-hidden="true" />

        <!-- Bulk Mode Actions (> 1 selected) -->
        <template v-if="isBulkMode">
          <DropdownMenuLabel class="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-signal tabular-telemetry">
            {{ $t('tasks.contextMenu.bulkHeader', { count: selectedCount }) }}
          </DropdownMenuLabel>

          <DropdownMenuItem as-child @select="emit('exportMarkdown')">
            <button
              type="button"
              data-testid="task-menu-bulk-markdown"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <Table class="h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
              <span>{{ $t('tasks.contextMenu.bulkCopyMarkdown') }}</span>
            </button>
          </DropdownMenuItem>

          <DropdownMenuItem as-child @select="emit('exportCsv')">
            <button
              type="button"
              data-testid="task-menu-bulk-csv"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <FileSpreadsheet class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>{{ $t('tasks.contextMenu.bulkExportCsv') }}</span>
            </button>
          </DropdownMenuItem>

          <DropdownMenuItem as-child @select="emit('duplicate')">
            <button
              type="button"
              data-testid="task-menu-bulk-duplicate"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <Copy class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>{{ $t('tasks.contextMenu.duplicate') }}</span>
              <span class="ml-auto text-xs text-text-faint" aria-hidden="true">⌘D</span>
            </button>
          </DropdownMenuItem>

          <DropdownMenuSeparator as="hr" class="my-1 border-border-hairline" />

          <DropdownMenuItem as-child @select="emit('bulkMarkDone')">
            <button
              type="button"
              data-testid="task-menu-bulk-done"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <CheckCircle2 class="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
              <span>{{ $t('tasks.contextMenu.bulkMarkDone') }}</span>
            </button>
          </DropdownMenuItem>

          <DropdownMenuItem as-child @select="emit('bulkMarkTodo')">
            <button
              type="button"
              data-testid="task-menu-bulk-todo"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <Circle class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>{{ $t('tasks.contextMenu.bulkMarkTodo') }}</span>
            </button>
          </DropdownMenuItem>

          <DropdownMenuSeparator as="hr" class="my-1 border-border-hairline" />

          <DropdownMenuItem as-child @select="emit('bulkDelete')">
            <button
              type="button"
              data-testid="task-menu-bulk-delete"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-destructive transition-colors hover:bg-destructive/10 focus:bg-destructive/10 focus:outline-none data-[highlighted]:bg-destructive/10"
            >
              <Trash2 class="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{{ $t('tasks.selection.deleteSelected', { count: selectedCount }) }}</span>
              <span class="ml-auto text-xs text-destructive/75" aria-hidden="true">Del</span>
            </button>
          </DropdownMenuItem>
        </template>

        <!-- Single-Task Actions -->
        <template v-else>
          <DropdownMenuItem as-child @select="emit('openDetails')">
            <button
              type="button"
              data-testid="task-menu-open-details"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <SlidersHorizontal class="h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
              <span>{{ $t('tasks.rowMenu.openDetails') }}</span>
              <span class="ml-auto text-xs text-text-faint" aria-hidden="true">Enter</span>
            </button>
          </DropdownMenuItem>

          <DropdownMenuItem as-child @select="emit('renameInline')">
            <button
              type="button"
              data-testid="task-menu-rename"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <Pencil class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>{{ $t('tasks.contextMenu.renameInline') }}</span>
              <span class="ml-auto text-xs text-text-faint" aria-hidden="true">F2</span>
            </button>
          </DropdownMenuItem>

          <DropdownMenuItem
            v-if="canAddSubtask"
            as-child
            @select="emit('addSubtask')"
          >
            <button
              type="button"
              data-testid="task-menu-add-subtask"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <Plus class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>
                {{ (depth ?? 0) === 0 ? $t('catalog.addSubtask') : $t('catalog.addSubSubtask') }}
              </span>
              <span class="ml-auto text-xs text-text-faint" aria-hidden="true">⇧Enter</span>
            </button>
          </DropdownMenuItem>

          <DropdownMenuItem as-child @select="emit('duplicate')">
            <button
              type="button"
              data-testid="task-menu-duplicate"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <Copy class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>{{ $t('tasks.contextMenu.duplicate') }}</span>
              <span class="ml-auto text-xs text-text-faint" aria-hidden="true">⌘D</span>
            </button>
          </DropdownMenuItem>

          <DropdownMenuItem as-child @select="emit('toggleSelect')">
            <button
              type="button"
              data-testid="task-menu-toggle-select"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <CheckSquare class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>
                {{ selected ? $t('tasks.rowMenu.deselectItem') : $t('tasks.rowMenu.selectItem') }}
              </span>
            </button>
          </DropdownMenuItem>

          <DropdownMenuItem
            v-if="canIndent"
            as-child
            @select="emit('indent')"
          >
            <button
              type="button"
              data-testid="task-menu-indent"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <IndentIncrease class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>{{ $t('tasks.rowMenu.indent') }}</span>
              <span class="ml-auto text-xs text-text-faint" aria-hidden="true">⌘]</span>
            </button>
          </DropdownMenuItem>

          <DropdownMenuItem
            v-if="canOutdent"
            as-child
            @select="emit('outdent')"
          >
            <button
              type="button"
              data-testid="task-menu-outdent"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <IndentDecrease class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>{{ $t('tasks.rowMenu.outdent') }}</span>
              <span class="ml-auto text-xs text-text-faint" aria-hidden="true">⌘[</span>
            </button>
          </DropdownMenuItem>

          <DropdownMenuSeparator as="hr" class="my-1 border-border-hairline" />

          <DropdownMenuItem v-if="externalUrl" as-child>
            <a
              :href="externalUrl"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="task-menu-open-ado"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-signal transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <ExternalLink class="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{{ $t('tasks.rowMenu.openInAdo') }}</span>
              <span class="ml-auto text-xs text-text-faint" aria-hidden="true">↗</span>
            </a>
          </DropdownMenuItem>

          <DropdownMenuItem as-child @select="emit('exportMarkdown')">
            <button
              type="button"
              data-testid="task-menu-copy-markdown"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <Table class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>{{ $t('tasks.contextMenu.copyMarkdown') }}</span>
            </button>
          </DropdownMenuItem>

          <DropdownMenuItem as-child @select="emit('exportCsv')">
            <button
              type="button"
              data-testid="task-menu-export-csv"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-text-primary transition-colors hover:bg-bg-hover focus:bg-bg-hover focus:outline-none data-[highlighted]:bg-bg-hover"
            >
              <Download class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span>{{ $t('tasks.contextMenu.exportCsv') }}</span>
            </button>
          </DropdownMenuItem>

          <DropdownMenuSeparator as="hr" class="my-1 border-border-hairline" />

          <DropdownMenuItem as-child @select="emit('delete')">
            <button
              type="button"
              data-testid="catalog-task-delete-trigger"
              class="flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-ui text-destructive transition-colors hover:bg-destructive/10 focus:bg-destructive/10 focus:outline-none data-[highlighted]:bg-destructive/10"
            >
              <Trash2 class="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{{ $t('confirm.deleteAction') }}</span>
              <span class="ml-auto text-xs text-destructive/75" aria-hidden="true">Del</span>
            </button>
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
