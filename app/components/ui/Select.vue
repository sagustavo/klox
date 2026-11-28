<script setup lang="ts">
import { Check, ChevronDown } from 'lucide-vue-next';
import {
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
  type AcceptableValue,
} from 'reka-ui';

export interface UiSelectOption<T extends string | number = string | number> {
  value: T;
  label: string;
  description?: string;
  badge?: string;
  color?: string;
  disabled?: boolean;
}

const EMPTY_VALUE_SENTINEL = '__klox_select_empty__';

const props = withDefaults(
  defineProps<{
    modelValue: string | number;
    options: readonly UiSelectOption[];
    placeholder?: string;
    ariaLabel?: string;
    id?: string;
    size?: 'sm' | 'md';
    tabular?: boolean;
    disabled?: boolean;
    testId?: string;
    align?: 'start' | 'end';
    triggerClass?: string;
  }>(),
  {
    placeholder: undefined,
    ariaLabel: undefined,
    id: undefined,
    size: 'md',
    tabular: false,
    disabled: false,
    testId: undefined,
    align: 'start',
    triggerClass: undefined,
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: string | number];
}>();

function toInternalValue(val: string | number): string {
  return val === '' ? EMPTY_VALUE_SENTINEL : String(val);
}

const internalValue = computed(() => toInternalValue(props.modelValue));

const selectedOption = computed(() =>
  props.options.find((opt) => toInternalValue(opt.value) === internalValue.value)
);

function handleUpdate(nextRaw: AcceptableValue) {
  if (nextRaw === undefined || nextRaw === null) return;
  const rawStr = String(nextRaw);
  const match = props.options.find((opt) => toInternalValue(opt.value) === rawStr);
  if (match) {
    emit('update:modelValue', match.value);
    return;
  }
  emit('update:modelValue', rawStr === EMPTY_VALUE_SENTINEL ? '' : rawStr);
}
</script>

<template>
  <SelectRoot
    :model-value="internalValue"
    :disabled="disabled"
    @update:model-value="handleUpdate"
  >
    <SelectTrigger
      :id="id"
      :data-testid="testId"
      :aria-label="ariaLabel"
      class="inline-flex w-full items-center justify-between gap-2 border border-border-input bg-bg-primary text-left text-text-primary transition-colors hover:bg-bg-hover focus:border-signal focus:outline-none data-[state=open]:border-signal disabled:cursor-not-allowed disabled:opacity-50"
      :class="[
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-10 px-3 text-ui',
        tabular ? 'tabular-telemetry' : '',
        triggerClass,
      ]"
    >
      <span class="flex min-w-0 flex-1 items-center gap-2">
        <span
          v-if="selectedOption?.color"
          class="h-2.5 w-2.5 shrink-0"
          :style="{ backgroundColor: selectedOption.color }"
          aria-hidden="true"
        />
        <SelectValue
          :placeholder="placeholder"
          class="min-w-0 flex-1 truncate"
          :class="selectedOption ? 'text-text-primary' : 'text-text-muted'"
        >
          {{ selectedOption?.label ?? placeholder }}
        </SelectValue>
      </span>
      <SelectIcon as-child>
        <ChevronDown class="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
      </SelectIcon>
    </SelectTrigger>

    <SelectPortal>
      <SelectContent
        position="popper"
        :side-offset="6"
        :collision-padding="12"
        :align="align"
        class="orbital-popover relative z-[60] max-h-72 min-w-[var(--reka-select-trigger-width)] max-w-[min(92vw,28rem)] overflow-hidden border border-border-hairline bg-bg-elevated shadow-2xl focus:outline-none"
      >
        <div class="signal-line" aria-hidden="true" />
        <SelectViewport class="max-h-72 overflow-y-auto divide-y divide-border-subtle p-0">
          <SelectItem
            v-for="opt in options"
            :key="toInternalValue(opt.value)"
            :value="toInternalValue(opt.value)"
            :disabled="opt.disabled"
            class="relative flex cursor-pointer select-none items-center justify-between gap-2.5 px-3 py-2 text-ui text-text-primary outline-none transition-colors hover:bg-bg-hover data-[highlighted]:bg-bg-hover data-[state=checked]:bg-signal-soft data-[state=checked]:font-medium data-[state=checked]:text-signal data-[disabled]:pointer-events-none data-[disabled]:opacity-45"
            :class="tabular ? 'tabular-telemetry' : ''"
          >
            <div class="flex min-w-0 flex-1 items-center gap-2">
              <span
                v-if="opt.color"
                class="h-2.5 w-2.5 shrink-0"
                :style="{ backgroundColor: opt.color }"
                aria-hidden="true"
              />
              <div class="min-w-0 flex-1">
                <SelectItemText class="block truncate">
                  {{ opt.label }}
                </SelectItemText>
                <span
                  v-if="opt.description"
                  class="block truncate text-xs font-normal text-text-muted"
                >
                  {{ opt.description }}
                </span>
              </div>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <span
                v-if="opt.badge"
                class="border border-border-hairline bg-bg-primary px-1.5 py-0.5 text-xs font-medium text-text-muted"
              >
                {{ opt.badge }}
              </span>
              <SelectItemIndicator class="inline-flex items-center text-signal">
                <Check class="h-3.5 w-3.5" aria-hidden="true" />
              </SelectItemIndicator>
            </div>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

