import type { DomainEvent } from './events';
import type {
  ChecklistItemId,
  OnboardingProfile,
  OnboardingState,
  SupportedLocale,
} from './types';

export const ALL_CHECKLIST_ITEMS: readonly ChecklistItemId[] = [
  'firstTimer',
  'recallUsed',
  'aiAutofill',
  'manualLog',
  'dashboardViewed',
  'csvRoundtrip',
] as const;

export function createDefaultOnboardingState(): OnboardingState {
  return {
    version: 1,
    wizardStatus: 'pending',
    checklist: {},
  };
}

/**
 * Pure reducer that marks onboarding checklist items as completed when a matching DomainEvent fires (ADR D10).
 */
export function applyDomainEventToOnboarding(
  state: OnboardingState,
  event: DomainEvent
): OnboardingState {
  let itemToComplete: ChecklistItemId | null = null;

  switch (event.type) {
    case 'TimerStopped':
      itemToComplete = 'firstTimer';
      break;
    case 'RecallTemplateSelected':
      itemToComplete = 'recallUsed';
      break;
    case 'AiAutofillUsed':
      itemToComplete = 'aiAutofill';
      break;
    case 'TimeLogCreated':
      if (event.source === 'manual') {
        itemToComplete = 'manualLog';
      }
      break;
    case 'DashboardViewed':
      itemToComplete = 'dashboardViewed';
      break;
    case 'CsvImported':
    case 'CsvExported':
      itemToComplete = 'csvRoundtrip';
      break;
    default:
      break;
  }

  if (!itemToComplete || state.checklist[itemToComplete]) {
    return state;
  }

  return {
    ...state,
    checklist: {
      ...state.checklist,
      [itemToComplete]: event.at,
    },
  };
}

export interface StarterProjectTemplate {
  name: string;
  color: string;
  isBillableDefault: boolean;
  tags: string[];
}

/**
 * Localized starter Project & Project-Scoped Tag catalog templates (FR-2).
 * Translated at creation time and then stored as plain user-owned entities.
 * Never seeds fake TimeLogs (BL-8).
 */
export function getStarterProjectTemplates(
  profile: OnboardingProfile,
  locale: SupportedLocale
): StarterProjectTemplate[] {
  const isPt = locale === 'pt-br';

  const workTemplates: StarterProjectTemplate[] = isPt
    ? [
        {
          name: 'Engenharia & Arquitetura',
          color: '#3B82F6',
          isBillableDefault: true,
          tags: ['architecture', 'backend', 'code-review', 'devops'],
        },
        {
          name: 'Produto & Alinhamento',
          color: '#6366F1',
          isBillableDefault: true,
          tags: ['planning', 'discovery', 'sync'],
        },
      ]
    : [
        {
          name: 'Core Engineering & Architecture',
          color: '#3B82F6',
          isBillableDefault: true,
          tags: ['architecture', 'backend', 'code-review', 'devops'],
        },
        {
          name: 'Product & Strategy',
          color: '#6366F1',
          isBillableDefault: true,
          tags: ['planning', 'discovery', 'sync'],
        },
      ];

  const personalTemplates: StarterProjectTemplate[] = isPt
    ? [
        {
          name: 'Pós-Graduação & Estudos IA',
          color: '#10B981',
          isBillableDefault: false,
          tags: ['capstone', 'ai-agents', 'leitura', 'pesquisa'],
        },
        {
          name: 'Saúde & Performance',
          color: '#F59E0B',
          isBillableDefault: false,
          tags: ['treino', 'corrida', 'mobilidade'],
        },
      ]
    : [
        {
          name: 'Post-Grad & AI Studies',
          color: '#10B981',
          isBillableDefault: false,
          tags: ['capstone', 'ai-agents', 'reading', 'research'],
        },
        {
          name: 'Health & Athletics',
          color: '#F59E0B',
          isBillableDefault: false,
          tags: ['workout', 'running', 'mobility'],
        },
      ];

  if (profile === 'work') return workTemplates;
  if (profile === 'personal') return personalTemplates;
  return [...workTemplates, ...personalTemplates];
}
