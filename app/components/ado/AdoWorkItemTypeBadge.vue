<script setup lang="ts">
import {
  AlertOctagon,
  BookOpen,
  Bug,
  CheckSquare,
  ClipboardList,
  Crown,
  ExternalLink,
  FlaskConical,
  GitBranch,
  Trophy,
} from 'lucide-vue-next';
import { getAdoWorkItemTypeVisual, type AdoWorkItemTypeKind } from '~/domain/ado';

const props = withDefaults(
  defineProps<{
    workItemType?: string | null;
    workItemId?: string | number | null;
    workItemTitle?: string | null;
    url?: string | null;
    completedWorkHours?: number;
    showHours?: boolean;
    showTitle?: boolean;
    compact?: boolean;
  }>(),
  {
    workItemType: undefined,
    workItemId: undefined,
    workItemTitle: undefined,
    url: undefined,
    completedWorkHours: 0,
    showHours: false,
    showTitle: false,
    compact: false,
  }
);

const visual = computed(() => getAdoWorkItemTypeVisual(props.workItemType));

const ICON_MAP: Record<AdoWorkItemTypeKind, Component> = {
  bug: Bug,
  pbi: ClipboardList,
  user_story: BookOpen,
  task: CheckSquare,
  feature: Trophy,
  epic: Crown,
  issue: AlertOctagon,
  test_case: FlaskConical,
  other: GitBranch,
};

const TONE_MAP: Record<AdoWorkItemTypeKind, string> = {
  bug: 'border-rose-500/45 bg-rose-500/10 text-rose-500',
  pbi: 'border-sky-500/45 bg-sky-500/10 text-sky-500',
  user_story: 'border-cyan-500/45 bg-cyan-500/10 text-cyan-500',
  task: 'border-amber-500/45 bg-amber-500/10 text-amber-500',
  feature: 'border-violet-500/45 bg-violet-500/10 text-violet-500',
  epic: 'border-orange-500/45 bg-orange-500/10 text-orange-500',
  issue: 'border-pink-500/45 bg-pink-500/10 text-pink-500',
  test_case: 'border-emerald-500/45 bg-emerald-500/10 text-emerald-500',
  other: 'border-signal/40 bg-signal-soft text-signal',
};

const badgeIcon = computed(() => ICON_MAP[visual.value.kind]);
const badgeToneClass = computed(() => TONE_MAP[visual.value.kind]);

const tooltipText = computed(() => {
  const parts = [visual.value.fullName];
  if (props.workItemId) parts.push(`#${props.workItemId}`);
  if (props.workItemTitle) parts.push(props.workItemTitle);
  return parts.join(' · ');
});
</script>

<template>
  <a
    v-if="url"
    :href="url"
    target="_blank"
    rel="noopener noreferrer"
    :title="tooltipText"
    class="tabular-telemetry inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs font-medium transition-colors hover:brightness-110"
    :class="badgeToneClass"
    @click.stop
  >
    <component :is="badgeIcon" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    <span v-if="!compact" class="font-semibold tracking-wide">{{ visual.shortLabel }}</span>
    <span v-if="workItemId" class="font-semibold">#{{ workItemId }}</span>
    <span
      v-if="showTitle && workItemTitle"
      class="hidden xl:inline max-w-[160px] truncate text-text-primary"
    >
      {{ workItemTitle }}
    </span>
    <span v-if="showHours" class="text-text-muted">· {{ (completedWorkHours || 0).toFixed(2) }}h</span>
    <ExternalLink class="h-3 w-3 shrink-0 opacity-75" aria-hidden="true" />
  </a>

  <span
    v-else
    :title="tooltipText"
    class="tabular-telemetry inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs font-medium"
    :class="badgeToneClass"
  >
    <component :is="badgeIcon" class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    <span v-if="!compact" class="font-semibold tracking-wide">{{ visual.shortLabel }}</span>
    <span v-if="workItemId" class="font-semibold">#{{ workItemId }}</span>
    <span v-if="showTitle && workItemTitle" class="max-w-[160px] truncate text-text-primary">
      {{ workItemTitle }}
    </span>
    <span v-if="showHours" class="text-text-muted">· {{ (completedWorkHours || 0).toFixed(2) }}h</span>
  </span>
</template>
