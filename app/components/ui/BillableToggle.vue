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
  <!-- Variant 1: Toggl-Style Row Icon (always visible when billable; revealed on row hover when non-billable) -->
  <button
    v-if="variant === 'row-icon'"
    type="button"
    :disabled="disabled"
    :data-tour="dataTour"
    :data-testid="testId ?? 'tracker-billable-toggle'"
    :aria-pressed="modelValue"
    :aria-label="resolvedTooltip"
    :title="resolvedTooltip"
    class="inline-flex h-8 w-8 shrink-0 items-center justify-center border font-mono transition-all focus:outline-none focus-visible:border-signal focus-visible:opacity-100 disabled:opacity-40 disabled:cursor-not-allowed"
    :class="
      modelValue
        ? 'opacity-100 border-signal/50 bg-signal-soft text-signal hover:bg-signal/25'
        : partial
          ? 'opacity-100 border-dashed border-signal/50 bg-signal-soft text-signal/85 hover:border-solid hover:bg-signal/20'
          : 'md:opacity-0 md:group-hover/row:opacity-100 max-md:opacity-60 border-transparent bg-transparent text-text-muted hover:border-border-hairline hover:bg-bg-primary hover:text-signal'
    "
    @click="handleRowIconClick"
  >
    <DollarSign class="h-4 w-4" />
  </button>

  <!-- Variant 2: Command Timer Bar Full-Height Hardware Toggle -->
  <SwitchRoot
    v-else-if="variant === 'command'"
    :model-value="modelValue"
    :disabled="disabled"
    :data-tour="dataTour"
    :data-testid="testId"
    :aria-label="label || $t('timer.billableToggle')"
    :title="resolvedTooltip"
    class="group/billable inline-flex h-10 max-md:min-h-[44px] w-full items-center justify-center gap-1.5 border px-3 text-ui font-mono transition-all select-none cursor-pointer focus:outline-none focus-visible:border-signal disabled:opacity-40 disabled:cursor-not-allowed"
    :class="
      modelValue
        ? 'border-signal/60 bg-signal-soft text-signal font-semibold'
        : 'border-border-input bg-bg-primary text-text-muted hover:border-text-muted/60 hover:text-text-primary'
    "
    @update:model-value="handleSwitchUpdate"
  >
    <DollarSign class="h-4 w-4 shrink-0 transition-transform group-active/billable:scale-95" />
    <SwitchThumb
      class="h-1.5 w-1.5 shrink-0 transition-all"
      :class="
        modelValue
          ? 'bg-signal'
          : 'bg-border-input group-hover/billable:bg-text-muted'
      "
    />
  </SwitchRoot>

  <!-- Variant 3: Tactile Orbital Switch Pill (Forms & Catalog Settings) -->
  <SwitchRoot
    v-else
    :model-value="modelValue"
    :disabled="disabled"
    :data-tour="dataTour"
    :data-testid="testId"
    class="group/billable inline-flex h-9 items-center gap-2 border px-3 text-ui font-mono transition-all select-none cursor-pointer focus:outline-none focus-visible:border-signal disabled:opacity-40 disabled:cursor-not-allowed"
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
