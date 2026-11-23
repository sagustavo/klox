import {
  DEFAULT_SIDEBAR_STATE,
  SIDEBAR_STORAGE_KEY,
  cycleSidebarState,
  parseSidebarState,
  resolveReopenSidebarState,
  type SidebarState,
  type VisibleSidebarState,
} from '~/domain/sidebar';

function readStoredSidebarState(): SidebarState {
  try {
    return parseSidebarState(window.localStorage.getItem(SIDEBAR_STORAGE_KEY));
  } catch {
    return DEFAULT_SIDEBAR_STATE;
  }
}

function writeStoredSidebarState(next: SidebarState): void {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next);
  } catch {
    // Ignore storage quota / restricted context failures
  }
}

/**
 * Shared 3-state desktop sidebar preference (`expanded` | `collapsed` | `hidden`)
 * persisted in `localStorage` under `klox_sidebar_state`.
 */
export function useSidebarState() {
  const sidebarState = useState<SidebarState>('klox_sidebar_state', () =>
    import.meta.client ? readStoredSidebarState() : DEFAULT_SIDEBAR_STATE
  );

  const lastVisibleState = useState<VisibleSidebarState>('klox_sidebar_last_visible', () =>
    sidebarState.value === 'collapsed' ? 'collapsed' : 'expanded'
  );

  const hasSyncedStorage = useState<boolean>('klox_sidebar_hydrated', () => false);

  function syncFromStorage(): void {
    if (!import.meta.client || hasSyncedStorage.value) return;
    const stored = readStoredSidebarState();
    sidebarState.value = stored;
    if (stored !== 'hidden') {
      lastVisibleState.value = stored;
    }
    hasSyncedStorage.value = true;
  }

  function setSidebarState(next: SidebarState): void {
    sidebarState.value = next;
    if (next !== 'hidden') {
      lastVisibleState.value = next;
    }
    if (import.meta.client) {
      writeStoredSidebarState(next);
    }
  }

  function cycleSidebar(): void {
    setSidebarState(cycleSidebarState(sidebarState.value));
  }

  function reopenSidebar(): void {
    setSidebarState(resolveReopenSidebarState(lastVisibleState.value));
  }

  return {
    sidebarState,
    syncFromStorage,
    setSidebarState,
    cycleSidebar,
    reopenSidebar,
  };
}
