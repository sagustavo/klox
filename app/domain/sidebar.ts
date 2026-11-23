export type SidebarState = 'expanded' | 'collapsed' | 'hidden';
export type VisibleSidebarState = 'expanded' | 'collapsed';

export const SIDEBAR_STORAGE_KEY = 'klox_sidebar_state';
export const DEFAULT_SIDEBAR_STATE: SidebarState = 'expanded';

/** Parses a persisted sidebar preference, falling back to 'expanded' on unknown values. */
export function parseSidebarState(raw: string | null | undefined): SidebarState {
  if (raw === 'expanded' || raw === 'collapsed' || raw === 'hidden') {
    return raw;
  }
  return DEFAULT_SIDEBAR_STATE;
}

/** Cycles desktop sidebar across the 3 Orbital visibility modes: expanded -> collapsed -> hidden -> expanded. */
export function cycleSidebarState(current: SidebarState): SidebarState {
  if (current === 'expanded') return 'collapsed';
  if (current === 'collapsed') return 'hidden';
  return 'expanded';
}

/** Resolves which visible mode to restore when reopening a hidden sidebar. */
export function resolveReopenSidebarState(
  lastVisible: VisibleSidebarState | null | undefined
): VisibleSidebarState {
  return lastVisible === 'collapsed' ? 'collapsed' : 'expanded';
}
