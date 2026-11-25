import {
  DEFAULT_SHORTCUT_MAP,
  SHORTCUT_COMMANDS,
  detectShortcutConflicts,
  formatShortcutKeycaps,
  formatShortcutText,
  isSingleKeyShortcut,
  matchesShortcutEvent,
  normalizeShortcutBinding,
  resolveEffectiveShortcuts,
  sanitizeShortcutOverrides,
} from '~/domain/shortcuts';
import type { KeyboardShortcutOverrides, ShortcutCommandId } from '~/domain/types';
import { useAuthStore } from '~/stores/auth';
import { usePreferencesStore } from '~/stores/preferences';

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return (el as HTMLElement).isContentEditable;
}

export function useShortcuts() {
  const prefsStore = usePreferencesStore();
  const authStore = useAuthStore();
  const isRecording = useState<boolean>('klox_recording_shortcut', () => false);
  const isMac = useState<boolean>('klox_is_mac', () => false);

  if (import.meta.client) {
    onMounted(() => {
      isMac.value = /Mac|iPhone|iPad|iPod/i.test(
        navigator.platform || navigator.userAgent || ''
      );
    });
  }

  const overrides = computed<KeyboardShortcutOverrides>(() =>
    sanitizeShortcutOverrides(prefsStore.preferences.keyboardShortcuts)
  );

  const effectiveKeymap = computed<Record<ShortcutCommandId, string>>(() =>
    resolveEffectiveShortcuts(overrides.value)
  );

  const conflicts = computed<Partial<Record<ShortcutCommandId, ShortcutCommandId[]>>>(() =>
    detectShortcutConflicts(effectiveKeymap.value)
  );

  const conflictCount = computed(() => Object.keys(conflicts.value).length);
  const hasCustomOverrides = computed(() => Object.keys(overrides.value).length > 0);

  function getBinding(id: ShortcutCommandId): string {
    return effectiveKeymap.value[id] ?? DEFAULT_SHORTCUT_MAP[id];
  }

  function getKeycaps(id: ShortcutCommandId): string[] {
    return formatShortcutKeycaps(getBinding(id), isMac.value);
  }

  function getFormattedText(id: ShortcutCommandId): string {
    return formatShortcutText(getBinding(id), isMac.value);
  }

  function isCustomized(id: ShortcutCommandId): boolean {
    return Boolean(overrides.value[id]);
  }

  function getConflictsFor(id: ShortcutCommandId): ShortcutCommandId[] {
    return conflicts.value[id] ?? [];
  }

  function matchesCommand(event: KeyboardEvent, id: ShortcutCommandId): boolean {
    if (isRecording.value) return false;
    const def = SHORTCUT_COMMANDS.find((c) => c.id === id);
    if (!def) return false;
    const binding = getBinding(id);
    const requiresNonEditable = !def.allowInEditable || isSingleKeyShortcut(binding);
    if (requiresNonEditable && isEditableElement(document.activeElement)) {
      return false;
    }
    return matchesShortcutEvent(event, binding);
  }

  async function setShortcut(id: ShortcutCommandId, rawBinding: string): Promise<boolean> {
    const normalized = normalizeShortcutBinding(rawBinding);
    if (!normalized) return false;
    const next: KeyboardShortcutOverrides = { ...overrides.value };
    if (normalized === DEFAULT_SHORTCUT_MAP[id]) {
      delete next[id];
    } else {
      next[id] = normalized;
    }
    await prefsStore.updatePreferences(
      { keyboardShortcuts: next },
      authStore.user?.uid,
      authStore.isDemoMode
    );
    return true;
  }

  async function resetShortcut(id: ShortcutCommandId): Promise<void> {
    if (!overrides.value[id]) return;
    const next: KeyboardShortcutOverrides = { ...overrides.value };
    delete next[id];
    await prefsStore.updatePreferences(
      { keyboardShortcuts: next },
      authStore.user?.uid,
      authStore.isDemoMode
    );
  }

  async function resetAllShortcuts(): Promise<void> {
    if (!hasCustomOverrides.value) return;
    await prefsStore.updatePreferences(
      { keyboardShortcuts: {} },
      authStore.user?.uid,
      authStore.isDemoMode
    );
  }

  return {
    commands: SHORTCUT_COMMANDS,
    overrides,
    effectiveKeymap,
    conflicts,
    conflictCount,
    hasCustomOverrides,
    isRecording,
    isMac,
    getBinding,
    getKeycaps,
    getFormattedText,
    isCustomized,
    getConflictsFor,
    matchesCommand,
    setShortcut,
    resetShortcut,
    resetAllShortcuts,
  };
}
