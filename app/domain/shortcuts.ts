import type { KeyboardShortcutOverrides, ShortcutCommandId } from './types';

export interface ShortcutCommandDefinition {
  id: ShortcutCommandId;
  defaultBinding: string;
  category: 'timer' | 'navigation';
  allowInEditable: boolean;
}

export interface KeyboardEventLike {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export const SHORTCUT_COMMANDS: readonly ShortcutCommandDefinition[] = [
  {
    id: 'timer.new',
    defaultBinding: 'N',
    category: 'timer',
    allowInEditable: false,
  },
  {
    id: 'timer.stop',
    defaultBinding: 'S',
    category: 'timer',
    allowInEditable: false,
  },
  {
    id: 'timer.resumeLast',
    defaultBinding: 'R',
    category: 'timer',
    allowInEditable: false,
  },
  {
    id: 'timer.aiAutofill',
    defaultBinding: 'Mod+I',
    category: 'timer',
    allowInEditable: true,
  },
  {
    id: 'ui.toggleSidebar',
    defaultBinding: 'Mod+\\',
    category: 'navigation',
    allowInEditable: true,
  },
  {
    id: 'ui.toggleHelp',
    defaultBinding: '?',
    category: 'navigation',
    allowInEditable: false,
  },
];

export const DEFAULT_SHORTCUT_MAP: Record<ShortcutCommandId, string> = {
  'timer.new': 'N',
  'timer.stop': 'S',
  'timer.resumeLast': 'R',
  'timer.aiAutofill': 'Mod+I',
  'ui.toggleSidebar': 'Mod+\\',
  'ui.toggleHelp': '?',
};

const COMMAND_SET = new Set<string>(SHORTCUT_COMMANDS.map((c) => c.id));

const BARE_MODIFIER_KEYS = new Set([
  'control',
  'ctrl',
  'shift',
  'alt',
  'altgraph',
  'meta',
  'os',
  'mod',
  'capslock',
  'numlock',
  'scrolllock',
  'dead',
  'unidentified',
  'escape',
  'esc',
  'tab',
]);

const SPECIAL_KEY_MAP: Record<string, string> = {
  ' ': 'Space',
  space: 'Space',
  spacebar: 'Space',
  enter: 'Enter',
  return: 'Enter',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  arrowup: 'ArrowUp',
  up: 'ArrowUp',
  arrowdown: 'ArrowDown',
  down: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  left: 'ArrowLeft',
  arrowright: 'ArrowRight',
  right: 'ArrowRight',
};

export function isValidShortcutCommandId(id: string): id is ShortcutCommandId {
  return COMMAND_SET.has(id);
}

function normalizeKeyToken(rawKey: string): string | null {
  if (!rawKey) return null;
  if (rawKey === ' ') return 'Space';

  const trimmed = rawKey.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (BARE_MODIFIER_KEYS.has(lower)) return null;

  const mappedSpecial = SPECIAL_KEY_MAP[lower];
  if (mappedSpecial) return mappedSpecial;

  const fnMatch = /^f([1-9]|1[0-2])$/i.exec(trimmed);
  if (fnMatch) return `F${fnMatch[1]}`;

  if (trimmed.length === 1) {
    if (/^[a-z]$/i.test(trimmed)) return trimmed.toUpperCase();
    return trimmed;
  }

  return null;
}

function splitBindingTokens(raw: string): string[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed === '+') return ['+'];

  const endsWithDoublePlus = trimmed.endsWith('++');
  const source = endsWithDoublePlus ? trimmed.slice(0, -1) : trimmed;
  const parts = source.split('+').map((p) => p.trim());
  if (parts.some((p) => p.length === 0)) return null;
  if (endsWithDoublePlus) {
    parts.push('+');
  }
  return parts;
}

interface ParsedBinding {
  mod: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

function parseNormalizedParts(parts: readonly string[]): ParsedBinding | null {
  if (parts.length === 0) return null;
  let mod = false;
  let ctrl = false;
  let alt = false;
  let shift = false;

  for (let i = 0; i < parts.length - 1; i++) {
    const token = parts[i]!.toLowerCase();
    if (
      token === 'mod' ||
      token === 'cmd' ||
      token === 'command' ||
      token === 'meta' ||
      token === '⌘' ||
      token === 'cmdorctrl' ||
      token === 'commandorcontrol'
    ) {
      mod = true;
    } else if (token === 'ctrl' || token === 'control') {
      ctrl = true;
    } else if (token === 'alt' || token === 'option' || token === 'opt' || token === '⌥') {
      alt = true;
    } else if (token === 'shift' || token === '⇧') {
      shift = true;
    } else {
      return null;
    }
  }

  const key = normalizeKeyToken(parts[parts.length - 1]!);
  if (!key) return null;

  return { mod, ctrl, alt, shift, key };
}

function formatNormalizedParsed(parsed: ParsedBinding): string {
  const tokens: string[] = [];
  if (parsed.mod) tokens.push('Mod');
  if (parsed.ctrl) tokens.push('Ctrl');
  if (parsed.alt) tokens.push('Alt');
  if (parsed.shift) tokens.push('Shift');
  tokens.push(parsed.key);
  return tokens.join('+');
}

export function normalizeShortcutBinding(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const tokens = splitBindingTokens(raw);
  if (!tokens) return null;
  const parsed = parseNormalizedParts(tokens);
  if (!parsed) return null;
  return formatNormalizedParsed(parsed);
}

export function sanitizeShortcutOverrides(raw: unknown): KeyboardShortcutOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const clean: KeyboardShortcutOverrides = {};
  for (const [cmdId, rawBinding] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidShortcutCommandId(cmdId) || typeof rawBinding !== 'string') continue;
    const normalized = normalizeShortcutBinding(rawBinding);
    if (!normalized || normalized === DEFAULT_SHORTCUT_MAP[cmdId]) continue;
    clean[cmdId] = normalized;
  }
  return clean;
}

export function resolveEffectiveShortcuts(
  overrides?: KeyboardShortcutOverrides
): Record<ShortcutCommandId, string> {
  const clean = sanitizeShortcutOverrides(overrides);
  return {
    ...DEFAULT_SHORTCUT_MAP,
    ...clean,
  };
}

export function detectShortcutConflicts(
  keymap: Record<ShortcutCommandId, string>
): Partial<Record<ShortcutCommandId, ShortcutCommandId[]>> {
  const commandsByBinding = new Map<string, ShortcutCommandId[]>();

  for (const def of SHORTCUT_COMMANDS) {
    const normalized = normalizeShortcutBinding(keymap[def.id] ?? def.defaultBinding);
    if (!normalized) continue;
    const list = commandsByBinding.get(normalized);
    if (list) {
      list.push(def.id);
    } else {
      commandsByBinding.set(normalized, [def.id]);
    }
  }

  const conflicts: Partial<Record<ShortcutCommandId, ShortcutCommandId[]>> = {};
  for (const ids of commandsByBinding.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      conflicts[id] = ids.filter((peer) => peer !== id);
    }
  }
  return conflicts;
}

export function isSingleKeyShortcut(binding: string): boolean {
  const normalized = normalizeShortcutBinding(binding);
  if (!normalized) return false;
  const tokens = splitBindingTokens(normalized);
  if (!tokens) return false;
  const parsed = parseNormalizedParts(tokens);
  if (!parsed) return false;
  return !parsed.mod && !parsed.ctrl && !parsed.alt;
}

function isNonAlphanumericSymbol(key: string): boolean {
  return key.length === 1 && !/^[a-z0-9]$/i.test(key);
}

export function captureShortcutFromEvent(event: KeyboardEventLike): string | null {
  const key = normalizeKeyToken(event.key);
  if (!key) return null;

  const hasMod = Boolean(event.metaKey || event.ctrlKey);
  const hasAlt = Boolean(event.altKey);
  const isPunct = isNonAlphanumericSymbol(key);
  const includeShift = Boolean(event.shiftKey) && (!isPunct || hasMod || hasAlt);

  return formatNormalizedParsed({
    mod: hasMod,
    ctrl: false,
    alt: hasAlt,
    shift: includeShift,
    key,
  });
}

export function matchesShortcutEvent(event: KeyboardEventLike, binding: string): boolean {
  const normalized = normalizeShortcutBinding(binding);
  if (!normalized) return false;
  const tokens = splitBindingTokens(normalized);
  if (!tokens) return false;
  const parsed = parseNormalizedParts(tokens);
  if (!parsed) return false;

  const eventMetaOrCtrl = Boolean(event.metaKey || event.ctrlKey);
  const eventCtrl = Boolean(event.ctrlKey);
  const eventMeta = Boolean(event.metaKey);
  const eventAlt = Boolean(event.altKey);
  const eventShift = Boolean(event.shiftKey);

  if (parsed.mod) {
    if (!eventMetaOrCtrl) return false;
    if (parsed.ctrl && !eventCtrl) return false;
  } else if (parsed.ctrl) {
    if (!eventCtrl || eventMeta) return false;
  } else if (eventMetaOrCtrl) {
    return false;
  }

  if (eventAlt !== parsed.alt) return false;

  const isPunct = isNonAlphanumericSymbol(parsed.key);
  const ignoreShiftForPlainPunct = isPunct && !parsed.shift && !parsed.mod && !parsed.ctrl && !parsed.alt;
  if (!ignoreShiftForPlainPunct && eventShift !== parsed.shift) {
    return false;
  }

  if (parsed.key === 'Space') {
    return event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space';
  }
  if (parsed.key === '\\') {
    return event.key === '\\' || event.code === 'Backslash';
  }
  if (parsed.key.length === 1 && /^[A-Z]$/.test(parsed.key)) {
    return event.key.toUpperCase() === parsed.key;
  }
  return event.key.toLowerCase() === parsed.key.toLowerCase();
}

export function formatShortcutKeycaps(binding: string, isMac = false): string[] {
  const normalized = normalizeShortcutBinding(binding);
  if (!normalized) return [binding];
  const tokens = splitBindingTokens(normalized);
  if (!tokens) return [binding];

  return tokens.map((tok) => {
    if (tok === 'Mod') return isMac ? '⌘' : 'Ctrl';
    if (tok === 'Ctrl') return 'Ctrl';
    if (tok === 'Alt') return isMac ? '⌥' : 'Alt';
    if (tok === 'Shift') return isMac ? '⇧' : 'Shift';
    if (tok === 'ArrowUp') return '↑';
    if (tok === 'ArrowDown') return '↓';
    if (tok === 'ArrowLeft') return '←';
    if (tok === 'ArrowRight') return '→';
    return tok;
  });
}

export function formatShortcutText(binding: string, isMac = false): string {
  return formatShortcutKeycaps(binding, isMac).join('+');
}
