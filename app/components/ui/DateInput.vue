<script setup lang="ts">
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import {
  PopoverAnchor,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
} from 'reka-ui';
import {
  buildCalendarMonthGrid,
  formatDateKeyForInput,
  getDateInputPlaceholder,
  parseFlexibleDateInput,
  resolvePreferredDateOrder,
  toDateKey,
} from '~/domain/duration';
import { usePreferencesStore } from '~/stores/preferences';

const props = withDefaults(
  defineProps<{
    modelValue: string; // Canonical "YYYY-MM-DD"
    valid?: boolean;
    calendarPlacement?: 'popover' | 'inline';
    size?: 'sm' | 'md';
    ariaLabel?: string;
    testId?: string;
  }>(),
  {
    valid: true,
    calendarPlacement: 'popover',
    size: 'sm',
    ariaLabel: undefined,
    testId: undefined,
  }
);

const emit = defineEmits<{
  'update:modelValue': [dateKey: string];
  'update:valid': [isValid: boolean];
}>();

const prefsStore = usePreferencesStore();

const inputRef = ref<HTMLInputElement | null>(null);
const isInputFocused = ref(false);
const calendarOpen = ref(false);
const isValid = ref(true);

const prefs = computed(() => prefsStore.preferences);
const intlLocale = computed(() => (prefs.value.locale === 'pt-br' ? 'pt-BR' : 'en-US'));
const preferredOrder = computed(() =>
  resolvePreferredDateOrder(prefs.value.dateFormat, prefs.value.locale)
);
const placeholder = computed(() =>
  getDateInputPlaceholder(prefs.value.dateFormat, prefs.value.locale)
);

const textValue = ref(
  formatDateKeyForInput(props.modelValue, prefs.value.dateFormat, prefs.value.locale)
);

function parseYearMonth(dateKey: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (match) {
    return { year: Number(match[1]), month: Number(match[2]) };
  }
  const fallbackKey = toDateKey(new Date(), prefs.value.timeZone || 'UTC');
  const fbMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fallbackKey);
  return {
    year: fbMatch ? Number(fbMatch[1]) : 2026,
    month: fbMatch ? Number(fbMatch[2]) : 1,
  };
}

const initialYM = parseYearMonth(props.modelValue);
const viewYear = ref(initialYM.year);
const viewMonth = ref(initialYM.month);

const todayDateKey = computed(() =>
  toDateKey(new Date(), prefs.value.timeZone || 'UTC')
);

const monthYearLabel = computed(() => {
  const safeUtc = new Date(Date.UTC(viewYear.value, viewMonth.value - 1, 15, 12, 0, 0));
  return new Intl.DateTimeFormat(intlLocale.value, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(safeUtc);
});

const weekdayLabels = computed(() => {
  const start = prefs.value.weekStartsOn;
  const formatter = new Intl.DateTimeFormat(intlLocale.value, {
    weekday: 'narrow',
    timeZone: 'UTC',
  });
  // 2026-11-01 is a Sunday (UTC day 0)
  return Array.from({ length: 7 }, (_, i) => {
    const dayIndex = (start + i) % 7;
    const refSundayPlus = new Date(Date.UTC(2026, 10, 1 + dayIndex, 12, 0, 0));
    return formatter.format(refSundayPlus);
  });
});

const calendarCells = computed(() =>
  buildCalendarMonthGrid({
    year: viewYear.value,
    month: viewMonth.value,
    weekStartsOn: prefs.value.weekStartsOn,
  })
);

function syncFromModelValue(nextDateKey: string, forceFormat = false) {
  const ym = parseYearMonth(nextDateKey);
  viewYear.value = ym.year;
  viewMonth.value = ym.month;
  isValid.value = true;
  emit('update:valid', true);
  if (!isInputFocused.value || forceFormat) {
    textValue.value = formatDateKeyForInput(
      nextDateKey,
      prefs.value.dateFormat,
      prefs.value.locale
    );
  }
}

watch(
  () => [props.modelValue, prefs.value.dateFormat, prefs.value.locale] as const,
  ([nextKey]) => {
    syncFromModelValue(nextKey);
  }
);

function handleTextInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value;
  textValue.value = raw;

  const parsed = parseFlexibleDateInput(raw, preferredOrder.value);
  if (parsed) {
    isValid.value = true;
    emit('update:valid', true);
    const ym = parseYearMonth(parsed);
    viewYear.value = ym.year;
    viewMonth.value = ym.month;
    if (parsed !== props.modelValue) {
      emit('update:modelValue', parsed);
    }
  } else {
    isValid.value = false;
    emit('update:valid', false);
  }
}

function handleBlur() {
  isInputFocused.value = false;
  const parsed = parseFlexibleDateInput(textValue.value, preferredOrder.value);
  if (parsed) {
    isValid.value = true;
    emit('update:valid', true);
    textValue.value = formatDateKeyForInput(
      parsed,
      prefs.value.dateFormat,
      prefs.value.locale
    );
    if (parsed !== props.modelValue) {
      emit('update:modelValue', parsed);
    }
  }
}

function handleInputKeydown(event: KeyboardEvent) {
  if (event.altKey && event.key === 'ArrowDown') {
    event.preventDefault();
    toggleCalendar();
  } else if (event.key === 'Escape' && calendarOpen.value) {
    event.preventDefault();
    event.stopPropagation();
    calendarOpen.value = false;
  }
}

function toggleCalendar() {
  if (!calendarOpen.value) {
    const ym = parseYearMonth(props.modelValue);
    viewYear.value = ym.year;
    viewMonth.value = ym.month;
  }
  calendarOpen.value = !calendarOpen.value;
}

function goPrevMonth() {
  if (viewMonth.value === 1) {
    viewMonth.value = 12;
    viewYear.value -= 1;
  } else {
    viewMonth.value -= 1;
  }
}

function goNextMonth() {
  if (viewMonth.value === 12) {
    viewMonth.value = 1;
    viewYear.value += 1;
  } else {
    viewMonth.value += 1;
  }
}

function selectCalendarDate(dateKey: string) {
  isInputFocused.value = false;
  isValid.value = true;
  emit('update:valid', true);
  textValue.value = formatDateKeyForInput(
    dateKey,
    prefs.value.dateFormat,
    prefs.value.locale
  );
  const ym = parseYearMonth(dateKey);
  viewYear.value = ym.year;
  viewMonth.value = ym.month;
  emit('update:modelValue', dateKey);
  calendarOpen.value = false;
}

function selectToday() {
  selectCalendarDate(todayDateKey.value);
}

defineExpose({
  focus: () => inputRef.value?.focus(),
});
</script>

<template>
  <!-- Mode A: Inline Expandable Calendar (ideal inside existing Popovers like TimeRangePopover) -->
  <div v-if="calendarPlacement === 'inline'" class="space-y-2">
    <div
      class="flex items-center border bg-bg-primary transition-colors focus-within:border-signal"
      :class="[
        size === 'md' ? 'h-10' : 'h-9',
        isValid ? 'border-border-input' : 'border-destructive/70',
      ]"
    >
      <input
        ref="inputRef"
        :value="textValue"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        spellcheck="false"
        :placeholder="placeholder"
        :aria-label="ariaLabel ?? $t('timer.timeRangePopover.dateLabel')"
        :aria-invalid="!isValid"
        :title="!isValid ? $t('timer.timeRangePopover.invalidDate', { format: placeholder }) : placeholder"
        :data-testid="testId ?? 'ui-date-input'"
        class="tabular-telemetry h-full w-full bg-transparent px-2.5 text-ui text-text-primary placeholder:text-text-faint focus:outline-none"
        @focus="isInputFocused = true"
        @blur="handleBlur"
        @input="handleTextInput"
        @keydown="handleInputKeydown"
      />
      <button
        type="button"
        :data-testid="testId ? `${testId}-calendar-toggle` : 'ui-date-calendar-toggle'"
        :aria-expanded="calendarOpen"
        :aria-label="$t('timer.timeRangePopover.openCalendar')"
        :title="$t('timer.timeRangePopover.openCalendar')"
        class="inline-flex h-full w-9 shrink-0 items-center justify-center border-l border-border-hairline text-text-muted transition-colors hover:bg-bg-hover hover:text-signal focus:outline-none focus-visible:text-signal"
        :class="calendarOpen ? 'bg-signal-soft text-signal' : ''"
        @click="toggleCalendar"
      >
        <Calendar class="h-4 w-4" />
      </button>
    </div>

    <Transition name="orbital-dropdown">
      <div
        v-if="calendarOpen"
        data-testid="ui-date-calendar-grid"
        class="border border-border-hairline bg-bg-primary p-3 space-y-2"
        @keydown.esc.stop="calendarOpen = false"
      >
        <div class="flex items-center justify-between">
          <button
            type="button"
            :aria-label="$t('timer.timeRangePopover.previousMonth')"
            class="inline-flex h-7 w-7 items-center justify-center border border-border-hairline bg-bg-elevated text-text-muted hover:border-signal/50 hover:text-text-primary transition-colors"
            @click="goPrevMonth"
          >
            <ChevronLeft class="h-4 w-4" />
          </button>

          <span class="tabular-telemetry text-xs font-semibold uppercase tracking-wider text-text-primary">
            {{ monthYearLabel }}
          </span>

          <button
            type="button"
            :aria-label="$t('timer.timeRangePopover.nextMonth')"
            class="inline-flex h-7 w-7 items-center justify-center border border-border-hairline bg-bg-elevated text-text-muted hover:border-signal/50 hover:text-text-primary transition-colors"
            @click="goNextMonth"
          >
            <ChevronRight class="h-4 w-4" />
          </button>
        </div>

        <div class="grid grid-cols-7 gap-0.5 text-center text-xs font-medium uppercase text-text-muted">
          <span v-for="(wd, idx) in weekdayLabels" :key="idx" class="py-1">
            {{ wd }}
          </span>
        </div>

        <div class="grid grid-cols-7 gap-0.5">
          <button
            v-for="cell in calendarCells"
            :key="cell.dateKey"
            type="button"
            :data-testid="`calendar-day-${cell.dateKey}`"
            class="tabular-telemetry h-8 border text-xs transition-colors focus:outline-none focus-visible:border-signal"
            :class="[
              cell.dateKey === modelValue
                ? 'border-accent bg-accent text-white font-semibold'
                : cell.dateKey === todayDateKey
                  ? 'border-signal/50 bg-signal-soft text-signal font-medium hover:bg-signal/20'
                  : cell.inCurrentMonth
                    ? 'border-transparent text-text-primary hover:border-border-hairline hover:bg-bg-hover'
                    : 'border-transparent text-text-faint hover:text-text-muted',
            ]"
            @click="selectCalendarDate(cell.dateKey)"
          >
            {{ cell.dayOfMonth }}
          </button>
        </div>

        <div class="flex items-center justify-between border-t border-border-hairline pt-2 text-xs">
          <span class="tabular-telemetry text-text-muted">{{ placeholder }}</span>
          <button
            type="button"
            data-testid="calendar-today-shortcut"
            class="text-signal hover:underline"
            @click="selectToday"
          >
            {{ $t('timer.timeRangePopover.todayShortcut') }}
          </button>
        </div>
      </div>
    </Transition>
  </div>

  <!-- Mode B: Floating Portal Popover Calendar (ideal for Page Forms like Manual Time Log) -->
  <PopoverRoot v-else v-model:open="calendarOpen">
    <PopoverAnchor as-child>
      <div
        class="flex items-center border bg-bg-primary transition-colors focus-within:border-signal"
        :class="[
          size === 'md' ? 'h-10' : 'h-9',
          isValid ? 'border-border-input' : 'border-destructive/70',
        ]"
      >
        <input
          ref="inputRef"
          :value="textValue"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          spellcheck="false"
          :placeholder="placeholder"
          :aria-label="ariaLabel ?? $t('timer.timeRangePopover.dateLabel')"
          :aria-invalid="!isValid"
          :title="!isValid ? $t('timer.timeRangePopover.invalidDate', { format: placeholder }) : placeholder"
          :data-testid="testId ?? 'ui-date-input'"
          class="tabular-telemetry h-full w-full bg-transparent px-2.5 text-ui text-text-primary placeholder:text-text-faint focus:outline-none"
          @focus="isInputFocused = true"
          @blur="handleBlur"
          @input="handleTextInput"
          @keydown="handleInputKeydown"
        />
        <button
          type="button"
          :data-testid="testId ? `${testId}-calendar-toggle` : 'ui-date-calendar-toggle'"
          :aria-expanded="calendarOpen"
          :aria-label="$t('timer.timeRangePopover.openCalendar')"
          :title="$t('timer.timeRangePopover.openCalendar')"
          class="inline-flex h-full w-9 shrink-0 items-center justify-center border-l border-border-hairline text-text-muted transition-colors hover:bg-bg-hover hover:text-signal focus:outline-none focus-visible:text-signal"
          :class="calendarOpen ? 'bg-signal-soft text-signal' : ''"
          @click="toggleCalendar"
        >
          <Calendar class="h-4 w-4" />
        </button>
      </div>
    </PopoverAnchor>

    <PopoverPortal>
      <PopoverContent
        align="start"
        :side-offset="6"
        :collision-padding="12"
        data-testid="ui-date-calendar-popover"
        class="orbital-popover relative z-50 w-72 overflow-hidden border border-border-hairline bg-bg-elevated p-3 shadow-2xl space-y-2 focus:outline-none"
        @open-auto-focus.prevent
      >
        <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
        <div class="flex items-center justify-between pt-0.5">
          <button
            type="button"
            :aria-label="$t('timer.timeRangePopover.previousMonth')"
            class="inline-flex h-7 w-7 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:border-signal/50 hover:text-text-primary transition-colors"
            @click="goPrevMonth"
          >
            <ChevronLeft class="h-4 w-4" />
          </button>

          <span class="tabular-telemetry text-xs font-semibold uppercase tracking-wider text-text-primary">
            {{ monthYearLabel }}
          </span>

          <button
            type="button"
            :aria-label="$t('timer.timeRangePopover.nextMonth')"
            class="inline-flex h-7 w-7 items-center justify-center border border-border-hairline bg-bg-primary text-text-muted hover:border-signal/50 hover:text-text-primary transition-colors"
            @click="goNextMonth"
          >
            <ChevronRight class="h-4 w-4" />
          </button>
        </div>

        <div class="grid grid-cols-7 gap-0.5 text-center text-xs font-medium uppercase text-text-muted">
          <span v-for="(wd, idx) in weekdayLabels" :key="idx" class="py-1">
            {{ wd }}
          </span>
        </div>

        <div class="grid grid-cols-7 gap-0.5">
          <button
            v-for="cell in calendarCells"
            :key="cell.dateKey"
            type="button"
            :data-testid="`calendar-day-${cell.dateKey}`"
            class="tabular-telemetry h-8 border text-xs transition-colors focus:outline-none focus-visible:border-signal"
            :class="[
              cell.dateKey === modelValue
                ? 'border-accent bg-accent text-white font-semibold'
                : cell.dateKey === todayDateKey
                  ? 'border-signal/50 bg-signal-soft text-signal font-medium hover:bg-signal/20'
                  : cell.inCurrentMonth
                    ? 'border-transparent text-text-primary hover:border-border-hairline hover:bg-bg-hover'
                    : 'border-transparent text-text-faint hover:text-text-muted',
            ]"
            @click="selectCalendarDate(cell.dateKey)"
          >
            {{ cell.dayOfMonth }}
          </button>
        </div>

        <div class="flex items-center justify-between border-t border-border-hairline pt-2 text-xs">
          <span class="tabular-telemetry text-text-muted">{{ placeholder }}</span>
          <button
            type="button"
            data-testid="calendar-today-shortcut"
            class="text-signal hover:underline"
            @click="selectToday"
          >
            {{ $t('timer.timeRangePopover.todayShortcut') }}
          </button>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
