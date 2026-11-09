/**
 * Klox — Pure Domain Model & Ubiquitous Language (GEMINI.md §2)
 * Zero Vue or Firebase imports allowed in app/domain/*.
 */

export type EntityId = string;

export type SystemProjectKey = 'unassigned';

export interface Project {
  id: EntityId;
  userId: string;
  name: string;
  color: string; // Hex color e.g. "#3B82F6"
  isBillableDefault: boolean;
  systemKey?: SystemProjectKey;
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
  name: string;
  description?: string; // Basic Markdown description (<= 4000 chars)
  targetHours?: number;
  externalProvider?: ExternalWorkItemProvider;
  externalWorkItemId?: string;
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
  tagNamesSnapshot: string[];
  isBillable: boolean;
  startTime: string; // UTC ISO
  endTime: string; // UTC ISO
  durationSeconds: number;
  timeZone: string; // IANA timezone snapshot at write time, e.g. "America/Sao_Paulo"
  dateKey: string; // "YYYY-MM-DD" computed in UserPreferences.timeZone
}

export type SupportedLocale = 'en' | 'pt-br';
export type WeekStartDay = 0 | 1 | 6; // Sun | Mon | Sat
export type DateFormatPreset = 'locale' | 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
export type HourCyclePreference = 'h12' | 'h23';

export interface UserPreferences {
  locale: SupportedLocale;
  timeZone: string; // IANA e.g. "America/Sao_Paulo"
  weekStartsOn: WeekStartDay;
  dateFormat: DateFormatPreset;
  hourCycle: HourCyclePreference;
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

export type SliceDimension = 'tag' | 'project' | 'description';

export interface DashboardFilters {
  preset: DateRangePreset;
  customStartDate?: string; // "YYYY-MM-DD"
  customEndDate?: string; // "YYYY-MM-DD"
  projectIds: EntityId[];
  taskIds: EntityId[];
  tagIds: EntityId[];
  searchQuery: string;
}
