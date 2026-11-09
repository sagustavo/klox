import Fuse from 'fuse.js';
import { buildRecallTemplates, type RecallTemplate } from '~/domain/recall';
import type { TimeLog } from '~/domain/types';

/**
 * Tier 1 — Instant Lexical Recall (`Fuse.js`, <2ms) over deduplicated historical templates.
 * Ranks by fuzzy match, frequency, and recency, returning the Top 10 matches.
 */
export function useTaskRecall(logs: MaybeRefOrGetter<readonly TimeLog[]>, queryText: Ref<string>) {
  const templates = computed<RecallTemplate[]>(() => buildRecallTemplates(toValue(logs)));

  const fuse = computed(
    () =>
      new Fuse(templates.value, {
        keys: [
          { name: 'description', weight: 0.75 },
          { name: 'projectNameSnapshot', weight: 0.25 },
        ],
        threshold: 0.4,
        includeScore: true,
        ignoreLocation: true,
      })
  );

  const topMatches = computed<RecallTemplate[]>(() => {
    const q = queryText.value.trim();
    if (!q) {
      return templates.value.slice(0, 10);
    }
    const results = fuse.value.search(q, { limit: 15 });
    return results
      .sort((a, b) => {
        const scoreDiff = (a.score ?? 1) - (b.score ?? 1);
        if (Math.abs(scoreDiff) > 0.12) return scoreDiff;
        if (b.item.frequency !== a.item.frequency) return b.item.frequency - a.item.frequency;
        return b.item.lastUsedTime.localeCompare(a.item.lastUsedTime);
      })
      .slice(0, 10)
      .map((r) => r.item);
  });

  return {
    templates,
    topMatches,
  };
}
