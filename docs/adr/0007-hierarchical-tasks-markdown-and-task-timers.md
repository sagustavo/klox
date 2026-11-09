# ADR-0007: Hierarchical Tasks (`Task` → `Subtask` → `Sub-subtask`), Markdown Descriptions, and Task-Driven Timers

- **Status:** Accepted
- **Date:** 2026-11-09
- **Deciders:** Gustavo (Founder & Principal Architect)
- **Related Requirements:** `FR-4.1`, `FR-4.2`, `FR-4.3`

## Context

In engineering and personal execution workflows, a macro `Project` (e.g., `"XP Core API"` or `"Post-Grad Capstone"`) contains actionable `Task` items that naturally decompose into smaller steps (`Subtask` and `Sub-subtask`), carry rich context notes (`description` in Markdown), and serve as the direct trigger for time tracking (`[▶ Start Timer]` directly from a task row rather than typing a free-text timer first and linking the task afterward).

## Decision

1. **Bounded 3-Level Adjacency List in `users/{uid}/tasks/{taskId}` (`depth: 0 | 1 | 2`):**
   - Each `Task` document remains in the flat per-user `users/{uid}/tasks` subcollection (so loading all tasks for a user/project remains a single collection read) and adds:
     - `parentTaskId?: EntityId | null` (`null`/omitted for root tasks)
     - `depth?: 0 | 1 | 2` (`0 = Task`, `1 = Subtask`, `2 = Sub-subtask`)
   - **Domain Invariant (`validateTaskParent`):** A child task's parent must belong to the **exact same `projectId`** and have `depth < 2`. Attaching a child to a `depth === 2` sub-subtask, self-parenting, or cross-project parenting is rejected.
   - **Cascade Delete & Roll-up Telemetry:** Deleting a task cascades deletion to all its descendants (`collectDescendantTaskIds`). Tracked duration on a parent task rolls up direct `TimeLog`s plus descendant subtask/sub-subtask `TimeLog`s.
2. **XSS-Safe Basic Markdown Descriptions (`app/domain/markdown.ts`):**
   - `Task.description?: string` stores up to `4000` characters of Markdown (`firestore.rules`).
   - Rendered via a pure, zero-dependency parser (`renderBasicMarkdown`) that HTML-escapes all raw user input first (`&`, `<`, `>`, `"`, `'`) before transforming headings (`#`–`###`), `**bold**`, `*italic*`, `` `inline code` ``, `[label](https://...)` links (restricted to `http://` and `https://`), unordered lists (`- ` / `* `), and interactive-style task checkboxes (`- [ ]` / `- [x]`).
3. **Direct Task-to-Timer Execution (`startTimerFromTask`):**
   - Starting a timer from any `Task`, `Subtask`, or `Sub-subtask` automatically:
     1. Stops and commits any currently running `ActiveTimer` into a `TimeLog` (preserving the Single Active Timer invariant).
     2. Starts a new `ActiveTimer` pre-bound with `projectId: task.projectId`, `taskId: task.id`, `description` defaulting to the task's hierarchical path (e.g., `"Auth Module / OAuth Flow / Write unit tests"` or leaf `task.name` for root tasks), and `isBillable: project.isBillableDefault`.
     3. Transitions the task's `status` from `'todo'` to `'in_progress'` if it was `'todo'`.

## Consequences

- **Positive:** Single-query Firestore hydration is preserved; unlimited nesting complexity is avoided via the explicit `depth: 0 | 1 | 2` cap; zero external Markdown bundle bloat or XSS risk; zero-friction execution from task planning to live telemetry.
- **Negative / Trade-offs:** Moving a root task between projects requires either clearing its parent link or moving its subtree together (enforced in the catalog store).
