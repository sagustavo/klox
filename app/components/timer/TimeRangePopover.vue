<script setup lang="ts">
import { Check, X } from 'lucide-vue-next';
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui';
import {
  formatHMS,
  resolveTimeRange,
  toLocalTimeInputValue,
} from '~/domain/duration';
import { usePreferencesStore } from '~/stores/preferences';

const props = withDefaults(
  defineProps<{
    startTime: string;
    endTime: string;
    durationSeconds: number;
    dateKey: string;
    compactDuration?: boolean;
  }>(),
  {
    compactDuration: false,
  }
);

const emit = defineEmits<{
  save: [payload: { startTimeUTC: string; endTimeUTC: string; durationSeconds: number }];
}>();

const prefsStore = usePreferencesStore();
const { formatDuration, formatTime } = useFormat(() => prefsStore.preferences);

const open = ref(false);
const focusTarget = ref<'start' | 'end'>('start');
const draftDateKey = ref(props.dateKey);
const isDateValid = ref(true);
const draftStartHMS = ref('09:00:00');
const draftEndHMS = ref('09:30:00');

const startInputRef = ref<HTMLInputElement | null>(null);
const endInputRef = ref<HTMLInputElement | null>(null);

const activeTimeZone = computed(() => prefsStore.preferences.timeZone || 'UTC');

const resolvedPreview = computed(() => {
  if (!open.value || !isDateValid.value || !draftDateKey.value) return null;
  return resolveTimeRange({
    dateKey: draftDateKey.value,
    startTimeInput: draftStartHMS.value,
    endTimeInput: draftEndHMS.value,
    timeZone: activeTimeZone.value,
  });
});

const isValidRange = computed(
  () =>
    isDateValid.value &&
    resolvedPreview.value !== null &&
    resolvedPreview.value.durationSeconds > 0
);

function openWithFocus(target: 'start' | 'end') {
  focusTarget.value = target;
  const tz = activeTimeZone.value;
  draftDateKey.value = props.dateKey;
  isDateValid.value = true;
  draftStartHMS.value = toLocalTimeInputValue(props.startTime, tz, true);
  draftEndHMS.value = toLocalTimeInputValue(props.endTime, tz, true);
  open.value = true;
}

watch(open, (isOpen) => {
  if (isOpen) {
    const tz = activeTimeZone.value;
    draftDateKey.value = props.dateKey;
    isDateValid.value = true;
    draftStartHMS.value = toLocalTimeInputValue(props.startTime, tz, true);
    draftEndHMS.value = toLocalTimeInputValue(props.endTime, tz, true);
    nextTick(() => {
      if (focusTarget.value === 'end') {
        endInputRef.value?.focus();
      } else {
        startInputRef.value?.focus();
      }
    });
  }
});

function handleSubmit() {
  const resolved = resolvedPreview.value;
  if (!resolved) return;
  emit('save', {
    startTimeUTC: resolved.startTimeUTC,
    endTimeUTC: resolved.endTimeUTC,
    durationSeconds: resolved.durationSeconds,
  });
  open.value = false;
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <div class="inline-flex items-center gap-2">
      <PopoverTrigger as-child>
        <button
          type="button"
          data-testid="tracker-log-time-trigger"
          :aria-label="$t('timer.clickToEditTimeRange')"
          :title="$t('timer.clickToEditTimeRange')"
          class="tabular-telemetry border border-transparent px-2 py-0.5 text-ui text-text-muted transition-colors hover:border-signal/50 hover:bg-signal-soft hover:text-signal focus:outline-none focus-visible:border-signal data-[state=open]:border-signal/50 data-[state=open]:bg-signal-soft data-[state=open]:text-signal"
          @click.prevent="openWithFocus('start')"
        >
          {{ formatTime(startTime) }} – {{ formatTime(endTime) }}
        </button>
      </PopoverTrigger>

      <button
        type="button"
        data-testid="tracker-log-duration-trigger"
        :aria-label="
          $t('timer.clickToEditDuration', {
            duration: formatDuration(durationSeconds),
          })
        "
        :title="$t('timer.clickToEditTimeRange')"
        class="tabular-telemetry border border-transparent px-2 py-0.5 transition-colors hover:border-signal/50 hover:bg-signal-soft hover:text-signal focus:outline-none focus-visible:border-signal"
        :class="[
          compactDuration ? 'text-ui sm:text-sm font-medium' : 'text-sm font-semibold',
          open ? 'border-signal/50 bg-signal-soft text-signal' : 'text-text-primary',
        ]"
        @click.stop="openWithFocus('end')"
      >
        {{ formatDuration(durationSeconds) }}
      </button>
    </div>

    <PopoverPortal>
      <PopoverContent
        align="end"
        :side-offset="6"
        :collision-padding="12"
        data-testid="tracker-time-range-popover"
        class="orbital-popover relative z-50 w-80 overflow-hidden border border-border-hairline bg-bg-elevated p-3.5 shadow-2xl focus:outline-none"
        @click.stop
      >
        <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
        <form class="space-y-3" @submit.prevent="handleSubmit">
          <div class="flex items-center justify-between border-b border-border-hairline pb-2 text-xs font-semibold uppercase tracking-wider text-signal">
            <span>{{ $t('timer.timeRangePopover.title') }}</span>
            <button
              type="button"
              :aria-label="$t('timer.cancelEditButton')"
              class="text-text-muted hover:text-text-primary"
              @click="open = false"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <!-- Editable Date Field (Typed Date + Interactive Calendar Picker) -->
          <div class="space-y-1">
            <span class="block text-xs font-medium uppercase text-text-muted">
              {{ $t('timer.timeRangePopover.dateLabel') }}
            </span>
            <UiDateInput
              v-model="draftDateKey"
              v-model:valid="isDateValid"
              calendar-placement="inline"
              size="sm"
              :aria-label="$t('timer.timeRangePopover.dateLabel')"
              test-id="tracker-inline-date"
            />
          </div>

          <div class="grid grid-cols-2 gap-2">
            <label class="space-y-1">
              <span class="block text-xs font-medium uppercase text-text-muted">
                {{ $t('timer.inlineStartLabel') }}
              </span>
              <input
                ref="startInputRef"
                v-model="draftStartHMS"
                type="time"
                step="1"
                required
                data-testid="tracker-inline-start-time"
                :aria-label="$t('timer.inlineStartLabel')"
                class="tabular-telemetry h-9 w-full border border-border-input bg-bg-primary px-2.5 text-ui text-text-primary focus:border-signal focus:outline-none"
              />
            </label>

            <label class="space-y-1">
              <span class="block text-xs font-medium uppercase text-text-muted">
                {{ $t('timer.inlineStopLabel') }}
              </span>
              <input
                ref="endInputRef"
                v-model="draftEndHMS"
                type="time"
                step="1"
                required
                data-testid="tracker-inline-stop-time"
                :aria-label="$t('timer.inlineStopLabel')"
                class="tabular-telemetry h-9 w-full border border-border-input bg-bg-primary px-2.5 text-ui text-text-primary focus:border-signal focus:outline-none"
              />
            </label>
          </div>

          <div class="flex items-center justify-between gap-2 pt-0.5">
            <span
              data-testid="tracker-inline-duration-preview"
              class="tabular-telemetry inline-flex items-center gap-1.5 border px-2.5 py-1 text-ui font-semibold"
              :class="
                isValidRange
                  ? 'border-signal/40 bg-signal-soft text-text-primary'
                  : 'border-destructive/50 bg-destructive/10 text-destructive'
              "
              :title="isValidRange ? undefined : $t('timer.invalidTimeRange')"
            >
              <span>
                {{
                  resolvedPreview && isValidRange
                    ? formatHMS(resolvedPreview.durationSeconds)
                    : '00:00:00'
                }}
              </span>
              <span
                v-if="resolvedPreview?.spansNextDay && isValidRange"
                class="text-xs text-signal"
              >
                {{ $t('timer.nextDayBadge') }}
              </span>
            </span>

            <button
              type="submit"
              data-testid="tracker-inline-save"
              :disabled="!isValidRange"
              class="btn-press inline-flex h-8 items-center gap-1.5 bg-accent px-3 text-xs font-semibold uppercase text-white hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check class="h-3.5 w-3.5" />
              <span>{{ $t('timer.timeRangePopover.applyButton') }}</span>
            </button>
          </div>
        </form>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
