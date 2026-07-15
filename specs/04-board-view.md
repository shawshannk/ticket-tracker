# 04 — Board (Kanban)

## Layout (from prototype)

- Columns = statuses, but **the set of columns depends on the Type filter**:
  - Type = "All": `[Backlog, Planned, In Progress, In Review, Blocked, On Hold, Done]` (union across types)
  - Type = "Epic": `[Planned, In Progress, Done]`
  - Type = "Story" or "Bug": `[Backlog, In Progress, In Review, Blocked, On Hold, Done]`
- Filters above the board: Sprint (`All`, `Backlog`, or a specific sprint) and Type (`All`, `Epic`, `Story`, `Bug`)
- Each column shows a count badge and its scoped tickets as draggable cards
- Dragging a card to a different column updates that ticket's `status` — **but only if the target status is valid for that ticket's type** (e.g. you can't drag a Bug into "Planned", since that's not in `BUG_STATUSES`)

## Drag-and-drop implementation

Prototype used raw HTML5 `draggable`/`onDragStart`/`onDrop`. Replace with **`@dnd-kit/core`**:
- `DndContext` wrapping the board
- Each column is a `useDroppable` zone
- Each card is a `useDraggable` item
- On drop: call the move mutation (below); on invalid target status, either don't render that ticket type's cards as draggable into that column at all, or reject with a toast — prefer the former (don't let the user attempt an invalid drop) since it's better UX than drag-then-reject.

## API

`PATCH /tickets/:id/status` — body `{ status: string }`
- Server validates the new status against the ticket's `type` (same `STATUS_BY_TYPE` mapping from spec 00) and rejects with 400 if invalid — **this must be enforced server-side**, not just by the frontend not offering invalid drop targets, since the API could be called directly.
- Updates `updated_at`.

For fetching the board's scoped data:
`GET /projects/:projectId/board?sprint=&type=` → returns tickets already grouped isn't necessary; return a flat filtered list and group into columns client-side (columns are a presentation concern, not worth a specialized endpoint shape).

## Frontend

- `TanStack Query` mutation for the status-change with **optimistic update**: move the card in the local cache immediately on drop, roll back if the API call fails (this matters much more here than in the prototype, since a real network call has real latency and can fail).
- Sprint and Type filter dropdowns as in prototype, bound to URL search params (consistent with the List view's approach in spec 03).
