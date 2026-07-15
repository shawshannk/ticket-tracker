# 07 — People & Users

## Layout (from prototype)

- People list: name, email, department, role badge, click-through to detail
- "Add team member" button — **Admin only**
- User Detail: editable name, email, department, role — save button (no dirty-state greyed-out logic needed here, prototype always allows save)
- Create User form: same fields, submit navigates to the new user's detail view

## API

- `GET /users` — list all users (global, not project-scoped — see spec 00 assumption)
- `GET /users/:id`
- `POST /users` — **guard: Admin only**
- `PATCH /users/:id` — **guard: Admin only**

Note there's no `DELETE /users/:id` in the prototype and none is spec'd here — removing a user who's an assignee/reporter on existing tickets needs a decision (soft-delete? reassign their tickets? block deletion?) that wasn't in scope of the original prototype. Flagging as a future decision, not building it now.

## Frontend

- Straightforward CRUD forms, no special state complexity like the ticket detail's draft/dirty pattern — prototype didn't have that here either.
- Role dropdown uses the same three roles as spec 00's permission matrix (`admin`, `manager`, `developer`).

## Important caveat carried from spec 08

None of these Admin-only guards are backed by real authentication yet — see spec 08 for exactly what that means in practice before you treat this as "access controlled."
