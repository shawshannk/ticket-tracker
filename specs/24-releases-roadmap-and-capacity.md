# 24 — Releases, Roadmap & Capacity

`startDate` and `estimatedEndDate` already sit on every ticket and drive nothing. There is no concept
of a version, and no way to answer "what is in the next release" or "when does this epic land".

## 1. Versions & releases

```ts
export const versions = pgTable('versions', {
  id, projectId, name, description, startDate, releaseDate, releasedAt,
  state,   // 'unreleased' | 'released' | 'archived'
});
```

- Tickets gain `fixVersionId` and `affectsVersionId` (the second matters for bugs — "broken in 2.1,
  fixed in 2.2" is a question the current model cannot express at all).
- `POST /versions/:id/release` refuses while non-Done tickets remain unless given
  `{ moveUnresolvedTo: versionId | null }`, mirroring sprint completion in spec 15 §1.
- Release burndown; a per-version progress bar by status category (spec 19 §1 makes that safe).
- Versions link to deployments (spec 18 §7), so a version's page answers which environments it has
  reached.

## 2. Release notes / changelog generation

`GET /versions/:id/release-notes?format=markdown|html` groups the version's tickets by type or by a
`release-note` label, includes keys, titles and linked PRs, and excludes anything labelled internal.

An optional AI pass (spec 27) rewrites the grouped list as prose. The deterministic grouped output is
always available and is what the endpoint returns by default — a release note that cannot be produced
without a model API call is a release note that fails at the worst moment.

## 3. Roadmap / timeline

An epic-level Gantt over data that already exists.

- Rows are epics (optionally expanded to stories), bars from `startDate` to `estimatedEndDate`,
  with a **derived** bar from child dates when an epic's own dates are unset — showing an empty
  roadmap because nobody filled in two date fields is how roadmap features die.
- Dependency arrows from `blocks` links (spec 20 §2), with cycle-safe layout guaranteed by that
  spec's write-time cycle check.
- Drag to reschedule (writes both dates and an event), drag an edge to resize.
- Zoom by week/month/quarter; a today marker; overdue and at-risk shading, where at-risk means the
  remaining points exceed the remaining capacity at current velocity.
- Sprint and version markers on the axis.
- A multi-project mode for anyone who can read several projects.

## 4. Capacity planning

- Per-member per-sprint availability (`sprint_capacity` from spec 15 §4), expressed in points or
  days, with a default from a working-pattern setting and subtractions for logged absences.
- An `absences` table (user, range, type) so a holiday is visible in planning rather than discovered.
- Over-allocation warning when a member's assigned points exceed availability, shown on the sprint
  planning view and the roadmap.
- A team-level forecast: at the trailing velocity, which epics complete by which sprint. Presented as
  a range, not a date — a single-point forecast from a three-sprint velocity is false precision.

## 5. Time tracking (optional per project)

`worklogs` (ticket, user, minutes, startedAt, description). `originalEstimate` and `remainingEstimate`
on the ticket, with remaining decrementing on log and correctable. `#time 2h` from spec 18 §4 writes
here. Reports per user, per sprint, per epic.

Off by default per project: a team that does not want timesheets must not see the fields at all.

## Out of scope

Financial/cost tracking, resource levelling algorithms, portfolio management above the org tier, and
billing/invoicing from worklogs.

## Acceptance criteria

- Releasing a version with unresolved tickets requires an explicit destination and moves them all.
- Release notes for a version list exactly its Done tickets, grouped, excluding internal-labelled ones.
- An epic with no dates renders a bar derived from its children's min/max.
- Dragging a bar writes both dates and one ticket event.
- A dependency arrow appears for every `blocks` link between two visible bars.
- Over-allocation warns when assigned points exceed capacity, and clears when work is reassigned.
- With time tracking off, no worklog field appears in any API response for that project.
