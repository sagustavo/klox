<script setup lang="ts">
const lines = [
  { keyPath: 'landing.visuals.csv.k1', valPath: 'landing.visuals.csv.v1' },
  { keyPath: 'landing.visuals.csv.k2', valPath: 'landing.visuals.csv.v2' },
  { keyPath: 'landing.visuals.csv.k3', valPath: 'landing.visuals.csv.v3' },
  { keyPath: 'landing.visuals.csv.k4', valPath: 'landing.visuals.csv.v4' },
  { keyPath: 'landing.visuals.csv.k5', valPath: 'landing.visuals.csv.v5' },
] as const;
</script>

<template>
  <div class="border border-border-hairline bg-bg-elevated font-mono text-sm">
    <div class="flex items-center gap-2.5 border-b border-border-hairline px-4 py-3">
      <span class="h-2 w-2 rounded-full bg-signal" aria-hidden="true" />
      <span class="label-mono text-text-muted">{{ $t('landing.visuals.csv.title') }}</span>
    </div>
    <div class="space-y-2.5 p-4">
      <div
        v-for="line in lines"
        :key="line.keyPath"
        class="flex items-baseline gap-4"
      >
        <span class="w-20 shrink-0 text-xs uppercase text-signal">{{ $t(line.keyPath) }}</span>
        <span class="text-ui text-text-muted">{{ $t(line.valPath) }}</span>
      </div>
    </div>
  </div>
</template>
