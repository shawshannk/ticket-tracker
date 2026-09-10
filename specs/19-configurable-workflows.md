# 19 — Configurable Workflows

`STATUS_BY_TYPE` is a constant compiled into `packages/shared`, consumed by `ticket-rules.ts` on the
server and by the board and forms on the client. Every project gets identical columns forever, and a
status change is a code change plus a deploy. This is the largest structural difference between this
product and the tools it is measured against.

The migration path matters more than the feature: nothing may break while the constant becomes data.

## 1. Model

```ts
export const workflows = pgTable('workflows', { id, projectId, name, ticketType, isDefault });
export const workflowStatuses = pgTable('workflow_statuses', {
  id, workflowId, name, category, order, color,
  // category: 'todo' | 'in_progress' | 'done' — charts, "is it finished", and the
  // Overview's open/closed counts key off the CATEGORY, never off a status name. This is
  // what stops every downstream report from hardcoding the string 'Done'.
});
export const workflowTransitions = pgTable('workflow_transitions', {
  id, workflowId, fromStatusId, toStatusId,   // fromStatusId null = "from any status"
  name, allowedRoles: text[], conditions: jsonb, postActions: jsonb,
});
```

`tickets.status` stays **text** (as specs/00 chose) and is validated against the project's workflow
rather than the global constant. Keeping the column as text is what makes the migration non-breaking.

## 2. Rules

- **Transition validity**: a move is allowed only if a transition exists from the current status to
  the target. Enforced in `MoveTicketStatusHandler` — the same server-side enforcement point spec 04
  already insists on, now reading data instead of a constant.
- **Conditions**: role, assignee-is-caller, required fields non-empty, all sub-tasks in a `done`
  category, no open blocking links (spec 20 §2), linked PR merged (spec 18).
- **Post-actions**: set assignee, clear assignee, set a field, add a label, fire a webhook.
- **Definition of Ready / Done checklists**: per workflow status, a checklist that must be complete
  before entering. Turns a team convention into an enforced rule, optionally advisory.
- `GET /tickets/:id/transitions` returns the transitions available *to the calling user right now*,
  with a reason for each unavailable one. The board and detail view render only those — the UI never
  computes availability itself, which is how the two drift.

## 3. Migration from the constant

1. Seed a "Default Epic" and "Default Story/Bug" workflow per existing project whose statuses and
   transitions exactly reproduce `STATUS_BY_TYPE` (all-to-all transitions, since that is today's
   behaviour).
2. `STATUS_BY_TYPE` remains exported as the seed source and as the fallback when a project has no
   workflow row, and is marked deprecated for direct use in validation.
3. `ticket-rules.ts` takes a workflow argument; its existing unit tests are re-pointed at the seeded
   default workflow and **must pass unchanged** — that is the proof the migration is behaviour-preserving.
4. Only then does the editor ship.

## 4. Workflow editor

Project settings → Workflows. A graph editor (nodes = statuses, edges = transitions) with a list-mode
fallback. Validation on save: every status reachable, at least one `done` category status, no orphan.

Changing a workflow with tickets in a status being removed requires a **mapping step** — pick a
target status for each affected ticket; the change and the bulk move happen in one transaction, with
one event per moved ticket. A workflow change is never allowed to strand a ticket in a status the
workflow no longer contains.

Workflows are shareable across projects in the same org (spec 23 §5) and copyable as a starting point.

## 5. Consequences elsewhere

- Board columns come from the workflow's statuses; spec 15 §6's column mapping keys on status id.
- Charts group by `category`, not by name — a project renaming "Done" to "Shipped" breaks nothing.
- TQL (spec 17) gains `statusCategory` as a queryable field.
- The status colour palette moves from the shared constant to `workflowStatuses.color`.

## Out of scope

Per-type workflow inheritance hierarchies, workflow versioning with historical replay, and screens
(per-transition field forms) beyond the required-fields condition.

## Acceptance criteria

- All pre-existing `ticket-rules.spec.ts` cases pass against seeded default workflows, unmodified.
- A transition not present in the workflow returns 400 from `PATCH /tickets/:id/status`, including
  when called directly against the API.
- A condition requiring all sub-tasks done blocks the parent's transition and names the offender.
- `GET /tickets/:id/transitions` for a developer omits a manager-only transition and gives a reason.
- Removing a status with 5 tickets in it forces a mapping and moves all 5 atomically.
- A project with no workflow rows still behaves exactly as it did before this module.
