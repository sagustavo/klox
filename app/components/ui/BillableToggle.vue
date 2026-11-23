<script setup lang="ts">
import { DollarSign } from 'lucide-vue-next';
import { SwitchRoot, SwitchThumb } from 'reka-ui';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    variant?: 'pill' | 'command' | 'row-icon';
    label?: string;
    partial?: boolean;
    disabled?: boolean;
    stopPropagation?: boolean;
    dataTour?: string;
    testId?: string;
  }>(),
  {
    variant: 'pill',
    label: undefined,
    partial: false,
    disabled: false,
    stopPropagation: false,
    dataTour: undefined,
    testId: undefined,
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const { t } = useI18n();

const resolvedTooltip = computed(() => {
  if (props.partial && !props.modelValue) {
    return t('timer.billableMixedGroup');
  }
  return props.modelValue ? t('timer.billableMarkOff') : t('timer.billableMarkOn');
});

function handleRowIconClick(event: MouseEvent) {
  if (props.stopPropagation) {
    event.stopPropagation();
  }
  if (props.disabled) return;
  emit('update:modelValue', !props.modelValue);
}

function handleSwitchUpdate(next: boolean) {
  emit('update:modelValue', Boolean(next));
}
</script>

<template>
  <!-- Variant 1: Row Icon (always visible when billable/partial; borderless hover/focus/touch reveal when non-billable) -->
  <button
    v-if="variant === 'row-icon'"
    type="button"
    :disabled="disabled"
    :data-tour="dataTour"
    :data-testid="testId ?? 'tracker-billable-toggle'"
    :aria-pressed="modelValue"
    :aria-label="resolvedTooltip"
    :title="resolvedTooltip"
    :class="[
      modelValue
        ? 'btn-press inline-flex h-8 w-8 shrink-0 items-center justify-center border border-signal/50 bg-signal-soft font-medium text-signal hover:bg-signal/25 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-signal'
        : partial
          ? 'btn-press inline-flex h-8 w-8 shrink-0 items-center justify-center border border-dashed border-signal/50 bg-signal-soft font-medium text-signal/85 hover:border-solid hover:bg-signal/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-signal'
          : 'row-action-ghost hover:text-signal',
      'disabled:opacity-40 disabled:cursor-not-allowed',
    ]"
    @click="handleRowIconClick"
  >
    <DollarSign class="h-4 w-4" aria-hidden="true" />
  </button>

  <!-- Variant 2: Borderless Icon-Only Command Timer Bar Toggle -->
  <SwitchRoot
    v-else-if="variant === 'command'"
    :model-value="modelValue"
    :disabled="disabled"
    :data-tour="dataTour"
    :data-testid="testId"
    :aria-label="label || $t('timer.billableToggle')"
    :title="resolvedTooltip"
    class="group/billable btn-press inline-flex h-9 w-9 shrink-0 items-center justify-center border border-transparent transition-colors select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:opacity-40 disabled:cursor-not-allowed"
    :class="
      modelValue
        ? 'bg-signal-soft text-signal hover:bg-signal/20'
        : 'bg-transparent text-text-muted hover:bg-bg-hover hover:text-text-primary'
    "
    @update:model-value="handleSwitchUpdate"
  >
    <DollarSign
      class="h-4 w-4 shrink-0 transition-transform group-active/billable:scale-95"
      aria-hidden="true"
    />
    <SwitchThumb class="sr-only" />
  </SwitchRoot>

  <!-- Variant 3: Tactile Orbital Switch Pill (Forms & Catalog Settings) -->
  <SwitchRoot
    v-else
    :model-value="modelValue"
    :disabled="disabled"
    :data-tour="dataTour"
    :data-testid="testId"
    class="group/billable btn-press inline-flex h-9 items-center gap-2 border px-3 text-ui font-medium transition-all select-none cursor-pointer focus:outline-none focus-visible:border-signal disabled:opacity-40 disabled:cursor-not-allowed"
    :class="
      modelValue
        ? 'border-signal/60 bg-signal-soft text-signal'
        : 'border-border-input bg-bg-primary text-text-muted hover:border-text-muted/60 hover:text-text-primary'
    "
    @update:model-value="handleSwitchUpdate"
  >
    <DollarSign
      class="h-4 w-4 shrink-0 transition-colors"
      :class="modelValue ? 'text-signal' : 'text-text-muted group-hover/billable:text-text-primary'"
      aria-hidden="true"
    />
    <span class="truncate">{{ label || $t('timer.billableToggle') }}</span>
    <span
      aria-hidden="true"
      class="relative inline-flex h-4 w-7 shrink-0 items-center border p-0.5 transition-colors"
      :class="
        modelValue
          ? 'border-signal/60 bg-signal-soft'
          : 'border-border-input bg-bg-elevated'
      "
    >
      <SwitchThumb
        class="block h-2.5 w-2.5 transition-transform data-[state=checked]:translate-x-3 data-[state=checked]:bg-signal data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-text-muted"
      />
    </span>
  </SwitchRoot>
</template>
