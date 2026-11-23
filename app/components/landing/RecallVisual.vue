<script setup lang="ts">
withDefaults(
  defineProps<{
    paused?: boolean;
  }>(),
  {
    paused: false,
  }
);

const rows = [
  { labelKey: 'landing.visuals.recall.row1', ms: '0.8ms' },
  { labelKey: 'landing.visuals.recall.row2', ms: '1.3ms' },
  { labelKey: 'landing.visuals.recall.row3', ms: '1.9ms' },
] as const;
</script>

<template>
  <div class="border border-border-hairline bg-bg-elevated text-sm">
    <div class="flex items-center justify-between border-b border-border-hairline px-4 py-3">
      <span class="text-text-faint">{{ $t('landing.visuals.recall.promptLabel') }}</span>
      <span class="label-eyebrow text-signal">{{ $t('landing.visuals.recall.tier1Badge') }}</span>
    </div>

    <div
      v-for="row in rows"
      :key="row.labelKey"
      class="flex items-center justify-between gap-4 border-b border-border-subtle px-4 py-2.5"
    >
      <span class="text-sm text-text-primary">{{ $t(row.labelKey) }}</span>
      <span class="tabular-telemetry shrink-0 text-xs text-text-muted">{{ row.ms }}</span>
    </div>

    <div class="relative overflow-hidden px-4 py-4">
      <div
        class="signal-line absolute inset-x-0 top-0"
        :class="!paused && 'animate-scan'"
        aria-hidden="true"
      />
      <div class="flex items-center justify-between gap-2">
        <span class="inline-flex items-center gap-2">
          <BrandKeycapBadge keys="⌘I" size="sm" />
          <span class="text-ui text-text-muted">{{ $t('landing.visuals.recall.aiBadge') }}</span>
        </span>
        <span class="label-eyebrow text-signal">{{ $t('landing.visuals.recall.matchStatus') }}</span>
      </div>

      <dl class="mt-3 grid grid-cols-1 gap-1.5 border border-border-subtle bg-bg-primary/60 p-3 text-xs sm:grid-cols-3">
        <div>
          <dt class="text-text-faint uppercase">{{ $t('landing.visuals.recall.previewProjectLabel') }}</dt>
          <dd class="mt-0.5 text-text-primary">{{ $t('landing.visuals.recall.previewProjectValue') }}</dd>
        </div>
        <div>
          <dt class="text-text-faint uppercase">{{ $t('landing.visuals.recall.previewTagsLabel') }}</dt>
          <dd class="mt-0.5 text-signal">{{ $t('landing.visuals.recall.previewTagsValue') }}</dd>
        </div>
        <div>
          <dt class="text-text-faint uppercase">{{ $t('landing.visuals.recall.previewDescLabel') }}</dt>
          <dd class="mt-0.5 text-text-primary truncate">{{ $t('landing.visuals.recall.previewDescValue') }}</dd>
        </div>
      </dl>
    </div>
  </div>
</template>
