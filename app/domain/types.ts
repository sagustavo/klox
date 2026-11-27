/**
 * Klox — Pure Domain Model & Ubiquitous Language (GEMINI.md §2)
 * Zero Vue or Firebase imports allowed in app/domain/*.
 */

export type EntityId = string;

export type SystemProjectKey = 'unassigned';

export type AdoAuthType = 'pat' | 'entra_oauth';

export interface AdoConnectionSummary {
  connected: boolean;
  authType: AdoAuthType;
  orgUrl: string; // Canonical "https://dev.azure.com/{org}"
  organization: string;
  defaultProject: string;
  defaultWorkItemType: string;
  tokenHint: string;
  connectedAt: string; // UTC ISO
  lastVerifiedAt: string; // UTC ISO
}

export interface ProjectAdoConfig {
  enabled: boolean;
  orgUrl?: string;
  project?: string;
  defaultWorkItemType?: string;
}

export interface TimeLogAdoSync {
  workItemId: number;
  orgUrl: string;
  project: string;
  syncedSeconds: number;
  syncedAt: string; // UTC ISO
}

export interface Project {
  id: EntityId;
  userId: string;
  name: string;
  color: string; // Hex color e.g. "#3B82F6"
  isBillableDefault: boolean;
  systemKey?: SystemProjectKey;
  adoConfig?: ProjectAdoConfig | null;
  createdAt: string; // UTC ISO
}

export interface ProjectTag {
  id: EntityId;
  userId: string;
  projectId: EntityId; // Strictly owned by a Project
  name: string;
  createdAt: string; // UTC ISO
}

export type ExternalWorkItemProvider = 'azure_devops' | null;
export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskDepth = 0 | 1 | 2; // 0 = Task, 1 = Subtask, 2 = Sub-subtask

export interface Task {
  id: EntityId;
  userId: string;
  projectId: EntityId;
  parentTaskId?: EntityId | null; // Optional parent Task/Subtask within the same Project
  depth?: TaskDepth; // 0 = Task, 1 = Subtask, 2 = Sub-subtask
  sortOrder?: number; // Sparse priority rank among siblings sharing (projectId, parentTaskId)
  name: string;
  description?: string; // Basic Markdown description (<= 4000 chars)
  targetHours?: number;
  externalProvider?: ExternalWorkItemProvider;
  externalWorkItemId?: string;
  externalWorkItemTitle?: string;
  externalWorkItemType?: string;
  externalWorkItemUrl?: string;
  externalOrgUrl?: string;
  externalProject?: string;
  externalSyncedAt?: string;
  completedWorkHours: number;
  status: TaskStatus;
  createdAt: string; // UTC ISO
}

/**
 * Singleton live-ticking stopwatch state.
 * Elapsed seconds are ALWAYS derived as Math.floor((nowMs - Date.parse(startTimeUTC)) / 1000).
 */
export interface ActiveTimer {
  description: string;
  projectId: EntityId;
  taskId?: EntityId;
  taskNameSnapshot?: string;
  tagIds: EntityId[];
  isBillable: boolean;
  startTimeUTC: string; // UTC ISO
}

/**
 * Historical persisted record of time spent.
 */
export interface TimeLog {
  id: EntityId;
  userId: string;
  description: string;
  normalizedDescription: string;
  projectId: EntityId;
  projectNameSnapshot: string;
  projectColorSnapshot: string;
  taskId?: EntityId;
  taskNameSnapshot?: string;
  tagIds: EntityId[];
  isBillable: boolean;
  startTime: string; // UTC ISO
  endTime: string; // UTC ISO
  durationSeconds: number;
  timeZone: string; // IANA timezone snapshot at write time, e.g. "America/Sao_Paulo"
  dateKey: string; // "YYYY-MM-DD" computed in UserPreferences.timeZone
  adoSync?: TimeLogAdoSync | null;
}

export type SupportedLocale = 'en' | 'pt-br';
export type WeekStartDay = 0 | 1 | 6; // Sun | Mon | Sat
export type DateFormatPreset = 'locale' | 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
export type HourCyclePreference = 'h12' | 'h23';

export type ShortcutCommandId =
  | 'timer.new'
  | 'timer.stop'
  | 'timer.resumeLast'
  | 'timer.aiAutofill'
  | 'ui.toggleSidebar'
  | 'ui.toggleHelp';

export type KeyboardShortcutOverrides = Partial<Record<ShortcutCommandId, string>>;

export interface UserPreferences {
  locale: SupportedLocale;
  timeZone: string; // IANA e.g. "America/Sao_Paulo"
  weekStartsOn: WeekStartDay;
  dateFormat: DateFormatPreset;
  hourCycle: HourCyclePreference;
  keyboardShortcuts?: KeyboardShortcutOverrides;
}

export type ChecklistItemId =
  | 'firstTimer'
  | 'recallUsed'
  | 'aiAutofill'
  | 'manualLog'
  | 'dashboardViewed'
  | 'csvRoundtrip';

export type OnboardingProfile = 'work' | 'personal' | 'both';
export type WizardStatus = 'pending' | 'completed' | 'skipped';

export interface OnboardingState {
  version: number;
  wizardStatus: WizardStatus;
  profile?: OnboardingProfile;
  tutorialCompletedAt?: string;
  checklist: Partial<Record<ChecklistItemId, string>>;
  checklistDismissedAt?: string;
}

export type DateRangePreset =
  | 'today'
  | 'this_week'
  | 'last_7_days'
  | 'this_month'
  | 'all_time'
  | 'custom';

export type SliceDimension = 'project' | 'task' | 'tag' | 'description';
export type GroupByDimension = 'none' | SliceDimension;
export type TimeGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface DashboardFilters {
  preset: DateRangePreset;
  customStartDate?: string; // "YYYY-MM-DD"
  customEndDate?: string; // "YYYY-MM-DD"
  projectIds: EntityId[];
  taskIds: EntityId[];
  tagIds: EntityId[];
  descriptions?: string[]; // Normalized descriptions selected via dedicated Log Description multi-select
  searchQuery: string;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string;
  username: string | null;
  googlePhotoUrl: string | null;
  customAvatarUrl: string | null;
  updatedAt?: string;
}

export type HeatmapIntensityLevel = 0 | 1 | 2 | 3 | 4;
export type HeatmapRangeSelection = 'rolling_365' | number;

export interface HeatmapDayCell {
  dateKey: string; // "YYYY-MM-DD"
  totalSeconds: number;
  logCount: number;
  level: HeatmapIntensityLevel;
  inRange: boolean;
  isToday: boolean;
  isFuture: boolean;
}

export interface HeatmapMonthLabel {
  weekIndex: number;
  monthIndex: number; // 0..11
  year: number;
}

export interface HeatmapSummary {
  totalSeconds: number;
  totalLogs: number;
  activeDays: number;
  longestStreakDays: number;
  currentStreakDays: number;
  bestDay: { dateKey: string; totalSeconds: number } | null;
}

export interface ActivityHeatmapData {
  range: HeatmapRangeSelection;
  startDateKey: string;
  endDateKey: string;
  weeks: HeatmapDayCell[][]; // Column-major: weeks[col][row], row length = 7
  weekdayOrder: number[]; // 7 weekday indices (0=Sun..6=Sat) starting at weekStartsOn
  monthLabels: HeatmapMonthLabel[];
  p90Seconds: number;
  summary: HeatmapSummary;
}
