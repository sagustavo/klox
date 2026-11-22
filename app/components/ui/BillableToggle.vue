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
    class="inline-flex h-7 w-7 shrink-0 items-center justify-center border font-mono transition-all focus:outline-none focus-visible:border-accent focus-visible:opacity-100 disabled:opacity-40 disabled:cursor-not-allowed"
    :class="
      modelValue
        ? 'opacity-100 border-accent/50 bg-accent/15 text-accent shadow-[0_0_10px_rgba(59,130,246,0.16)] hover:bg-accent/25'
        : partial
          ? 'opacity-100 border-dashed border-accent/50 bg-accent/10 text-accent/85 hover:border-solid hover:bg-accent/20'
          : 'md:opacity-0 md:group-hover/row:opacity-100 max-md:opacity-55 border-transparent bg-transparent text-text-muted/70 hover:border-border-hairline hover:bg-bg-primary hover:text-accent'
    "
    @click="handleRowIconClick"
  >
    <DollarSign class="h-3.5 w-3.5" />
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
    class="group/billable inline-flex h-10 w-full items-center justify-center gap-1.5 border px-2.5 text-xs font-mono transition-all select-none cursor-pointer focus:outline-none focus-visible:border-accent disabled:opacity-40 disabled:cursor-not-allowed"
    :class="
      modelValue
        ? 'border-accent/60 bg-accent/15 text-accent font-semibold shadow-[0_0_14px_rgba(59,130,246,0.16)]'
        : 'border-border-hairline bg-bg-primary text-text-muted hover:border-text-muted/40 hover:text-text-primary'
    "
    @update:model-value="handleSwitchUpdate"
  >
    <DollarSign class="h-3.5 w-3.5 shrink-0 transition-transform group-active/billable:scale-95" />
    <SwitchThumb
      class="h-1.5 w-1.5 shrink-0 transition-all"
      :class="
        modelValue
          ? 'bg-accent shadow-[0_0_6px_#3B82F6]'
          : 'bg-border-hairline group-hover/billable:bg-text-muted'
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
    class="group/billable inline-flex h-8 items-center gap-2 border px-2.5 text-xs font-mono transition-all select-none cursor-pointer focus:outline-none focus-visible:border-accent disabled:opacity-40 disabled:cursor-not-allowed"
    :class="
      modelValue
        ? 'border-accent/60 bg-accent/15 text-accent shadow-[0_0_12px_rgba(59,130,246,0.14)]'
        : 'border-border-hairline bg-bg-primary text-text-muted hover:border-text-muted/40 hover:text-text-primary'
    "
    @update:model-value="handleSwitchUpdate"
  >
    <DollarSign
      class="h-3.5 w-3.5 shrink-0 transition-colors"
      :class="modelValue ? 'text-accent' : 'text-text-muted group-hover/billable:text-text-primary'"
    />
    <span class="truncate">{{ label || $t('timer.billableToggle') }}</span>
    <span
      aria-hidden="true"
      class="relative inline-flex h-3.5 w-6 shrink-0 items-center border p-0.5 transition-colors"
      :class="
        modelValue
          ? 'border-accent/60 bg-accent/25'
          : 'border-border-hairline bg-bg-elevated'
      "
    >
      <SwitchThumb
        class="block h-2 w-2 transition-transform data-[state=checked]:translate-x-2.5 data-[state=checked]:bg-accent data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-text-muted"
      />
    </span>
  </SwitchRoot>
</template>
