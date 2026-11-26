/**
 * Lightweight typed in-app Domain Event bus (ADR-0006 / D10).
 * Producers (timer, catalog, csv, ai) publish events; consumers (onboarding checklist, future ADO sync) subscribe.
 */

export type TimeLogSource = 'timer' | 'manual' | 'import';

export type DomainEvent =
  | { type: 'TimerStarted'; at: string }
  | { type: 'TimerStopped'; at: string }
  | { type: 'TimeLogCreated'; at: string; source: TimeLogSource }
  | { type: 'RecallTemplateSelected'; at: string }
  | { type: 'AiAutofillUsed'; at: string }
  | { type: 'DashboardViewed'; at: string }
  | { type: 'CsvImported'; at: string; rows: number }
  | { type: 'CsvExported'; at: string; rows: number }
  | { type: 'ProfileUpdated'; at: string }
  | { type: 'WorkspaceWiped'; at: string }
  | { type: 'AuthProviderLinked'; at: string; providerId: 'google.com' | 'password' }
  | { type: 'AuthProviderUnlinked'; at: string; providerId: 'google.com' | 'password' }
  | { type: 'PasswordResetRequested'; at: string }
  | { type: 'PasswordResetCompleted'; at: string };

export type DomainEventHandler = (event: DomainEvent) => void;

const listeners = new Set<DomainEventHandler>();

export function publishDomainEvent(event: DomainEvent): void {
  for (const handler of listeners) {
    try {
      handler(event);
    } catch (err) {
      console.error('[Klox DomainEvent handler error]', err);
    }
  }
}

export function subscribeDomainEvents(handler: DomainEventHandler): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}
