<script setup lang="ts">
import { Check, X } from 'lucide-vue-next';
import type { EntityId, Project, ProjectTag } from '~/domain/types';

defineProps<{
  description: string;
  projectId: EntityId;
  tagIds: readonly EntityId[];
  isBillable: boolean;
  durationHMS: string;
  projects: readonly Project[];
  scopedTags: readonly ProjectTag[];
}>();

const emit = defineEmits<{
  'update:description': [value: string];
  changeProject: [projectId: EntityId];
  toggleTag: [tagId: EntityId];
  'update:isBillable': [value: boolean];
  'update:durationHMS': [value: string];
  save: [];
  cancel: [];
}>();

const { t } = useI18n();

function displayProjectName(project: Project): string {
  return project.systemKey === 'unassigned' ? t('catalog.unassigned') : project.name;
}
</script>

<template>
  <form
    data-testid="tracker-inline-edit-form"
    class="space-y-2.5"
    @submit.prevent="emit('save')"
    @keydown.esc.stop="emit('cancel')"
  >
    <div class="grid grid-cols-1 gap-2 sm:grid-cols-12">
      <input
        :value="description"
        type="text"
        class="sm:col-span-5 h-8 border border-border-hairline bg-bg-primary px-2.5 text-xs text-text-primary focus:border-accent focus:outline-none"
        @input="emit('update:description', ($event.target as HTMLInputElement).value)"
      />
      <select
        :value="projectId"
        class="sm:col-span-3 h-8 border border-border-hairline bg-bg-primary px-2 text-xs text-text-primary focus:border-accent focus:outline-none"
        @change="emit('changeProject', ($event.target as HTMLSelectElement).value)"
      >
        <option
          v-for="proj in projects"
          :key="proj.id"
          :value="proj.id"
        >
          {{ displayProjectName(proj) }}
        </option>
      </select>
      <input
        :value="durationHMS"
        type="text"
        class="tabular-telemetry sm:col-span-2 h-8 border border-border-hairline bg-bg-primary px-2.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
        @input="emit('update:durationHMS', ($event.target as HTMLInputElement).value)"
      />
      <div class="sm:col-span-2 flex items-center justify-end gap-1.5">
        <button
          type="submit"
          :aria-label="$t('timer.saveEditButton')"
          :title="$t('timer.saveEditButton')"
          class="inline-flex h-8 items-center gap-1 bg-accent px-2.5 text-xs font-mono text-white hover:bg-accent-hover transition-colors"
        >
          <Check class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          :aria-label="$t('timer.cancelEditButton')"
          :title="$t('timer.cancelEditButton')"
          class="inline-flex h-8 items-center border border-border-hairline bg-bg-primary px-2 text-xs text-text-muted hover:text-text-primary transition-colors"
          @click="emit('cancel')"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-1.5">
      <button
        v-for="tag in scopedTags"
        :key="tag.id"
        type="button"
        class="border px-2 py-0.5 text-[11px] font-mono transition-colors"
        :class="
          tagIds.includes(tag.id)
            ? 'border-accent bg-accent/15 text-accent'
            : 'border-border-hairline bg-bg-primary text-text-muted'
        "
        @click="emit('toggleTag', tag.id)"
      >
        #{{ tag.name }}
      </button>
      <label class="ml-2 inline-flex items-center gap-1 text-xs font-mono text-text-muted cursor-pointer">
        <input
          :checked="isBillable"
          type="checkbox"
          class="accent-accent"
          @change="emit('update:isBillable', ($event.target as HTMLInputElement).checked)"
        />
        <span>$</span>
      </label>
    </div>
  </form>
</template>
