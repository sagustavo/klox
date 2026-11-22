<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    value: string;
    compact?: boolean;
    stopPropagation?: boolean;
    testId?: string;
  }>(),
  {
    compact: false,
    stopPropagation: false,
    testId: undefined,
  }
);

const emit = defineEmits<{
  save: [nextDescription: string];
}>();

const editing = ref(false);
const draft = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
let ignoreNextBlur = false;

function startEditing(event: MouseEvent) {
  if (props.stopPropagation) {
    event.stopPropagation();
  }
  draft.value = props.value;
  editing.value = true;
  ignoreNextBlur = false;
  nextTick(() => {
    inputRef.value?.focus();
    inputRef.value?.select();
  });
}

function commitEdit() {
  if (!editing.value) return;
  editing.value = false;
  const trimmed = draft.value.trim();
  if (!trimmed || trimmed === props.value) return;
  emit('save', trimmed);
}

function cancelEdit() {
  ignoreNextBlur = true;
  editing.value = false;
  draft.value = props.value;
}

function handleBlur() {
  if (ignoreNextBlur) {
    ignoreNextBlur = false;
    return;
  }
  commitEdit();
}
</script>

<template>
  <input
    v-if="editing"
    ref="inputRef"
    v-model="draft"
    type="text"
    :data-testid="testId ? `${testId}-input` : 'tracker-inline-description-input'"
    class="h-7 min-w-[11rem] sm:min-w-[15rem] border border-accent bg-bg-primary px-2 text-text-primary focus:outline-none"
    :class="compact ? 'text-xs sm:text-sm' : 'text-sm font-medium'"
    @click.stop
    @blur="handleBlur"
    @keydown.enter.prevent.stop="commitEdit"
    @keydown.esc.prevent.stop="cancelEdit"
  />
  <button
    v-else
    type="button"
    :data-testid="testId ?? 'tracker-log-description-trigger'"
    :title="$t('timer.clickToEditDescription')"
    class="text-left text-text-primary transition-colors hover:text-accent focus:outline-none focus-visible:underline"
    :class="compact ? 'text-xs sm:text-sm' : 'text-sm font-medium'"
    @click="startEditing"
  >
    {{ value }}
  </button>
</template>
