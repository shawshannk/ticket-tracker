# 06 — Create Ticket

## Layout (from prototype)

- Type selector (Epic / Story / Bug) — **Epic option hidden entirely for Developer role** (not just disabled)
- Fields shown depend on type:
  - **Epic**: title, description, assignee, labels — no priority-severity/env/size/dates/sprint complexity beyond what Epics track (priority defaults to Medium, per prototype)
  - **Story**: title, description, priority, assignee, env, size, start/end dates, sprint, epic (required)
  - **Bug**: all Story fields **plus** severity, **plus** optional Story link (dropdown filtered to stories under the selected epic)
- Submit creates the ticket and navigates straight to its Detail view (matches prototype behavior)

## API

`POST /projects/:projectId/tickets`

Body validated with a Zod schema (shared package) that itself branches on `type`:
```ts
const baseTicketSchema = z.object({
  type: z.enum(['epic', 'story', 'bug']),
  title: z.string().min(1),
  description: z.string(),
  assigneeId: z.string().uuid().nullable(),
  labels: z.array(z.string()),
});

const storyOrBugFields = z.object({
  priority: z.enum(['critical','high','medium','low']),
  env: z.enum(['production','staging','development']),
  size: z.enum(['xs','s','m','l','xl']),
  startDate: z.string().nullable(),
  estimatedEndDate: z.string().nullable(),
  sprintId: z.string().uuid().nullable(),
  epicId: z.string().uuid(), // required for Story/Bug
});

const bugOnlyFields = z.object({
  severity: z.enum(['1','2','3','4']),
  storyId: z.string().uuid().nullable(),
});
```
Server-side, **also** re-check the role gate for Epic creation (Developer → 403), since the frontend hiding the option is a UX nicety, not a security control (see spec 08 for why that distinction matters without real auth).

## Ticket key + defaults

- Key generated per spec 02 (`{project.key_prefix}-{next_seq}`)
- `reporter` field: the prototype's create form didn't actually let the user set a reporter (it only appears pre-filled on seed data) — **this is a gap worth deciding on**: should the create form let the creator set/type a reporter, or should it auto-fill from whichever user is "acting as" (spec 08)? I'd default to auto-filling from the acting user unless you want a free-text field.

## Frontend

- Same type-tab UI pattern as prototype (colored pills for Epic/Story/Bug)
- Story dropdown (Bug type only) filtered client-side or server-side to stories where `epic_id` matches the currently-selected epic in the form — refetch this list whenever the epic selection changes.
