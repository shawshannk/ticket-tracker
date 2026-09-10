# 28 — UX Polish, Accessibility, i18n & Mobile

The last module of the phase, and the one most likely to be skipped, which is why it is specified
rather than left as "polish". None of it is optional for a product used all day.

## 1. Accessibility (WCAG 2.2 AA)

- **Keyboard-complete**: every action reachable without a mouse. The board's drag-and-drop already
  uses `@dnd-kit` partly for this reason (spec 04) — its keyboard sensor must actually be wired, with
  announced pick-up, move and drop.
- Focus management on every modal, drawer and menu: trap, restore on close, visible focus rings that
  survive the Tailwind reset.
- Semantic landmarks, correct heading order, labelled form controls, `aria-describedby` on every
  error (the error contract in spec 11 §3 gives each one a stable id to point at).
- Live regions for async outcomes: save confirmations, drag results, notification arrivals.
- Colour is never the only signal — the status, priority and severity palettes inherited from the
  prototype must each carry a shape, icon or text label as well.
- Contrast audit of the full palette in both themes; `prefers-reduced-motion` respected by every
  transition and by the board's drag animation.
- `axe-core` in the Playwright suite, failing CI on a violation, plus a manual screen-reader pass
  (VoiceOver/NVDA) documented per view.

## 2. Keyboard shortcuts

A discoverable, conflict-free scheme with a `?` overlay: `c` create, `/` search, `g`+letter for view
navigation, `j`/`k` row movement, `e` edit, `a` assign, `m` comment, `Cmd-K` palette (spec 17 §4),
`Cmd-Enter` submit from any form. User-remappable, stored per user, and disabled inside text inputs.

## 3. Dark mode & theming

A full dark theme via CSS custom properties, following the system preference with an explicit
override persisted per user. Per-org branding (logo, accent) from spec 23 §5. Every palette moves
from hardcoded Tailwind classes to tokens — a second theme is otherwise a permanent source of
one-off contrast bugs.

## 4. Internationalisation

- `react-i18next`; every user-facing string extracted, with an English catalogue as the source and a
  CI check that fails on a hardcoded literal in a component.
- **Dates and times are the real work.** Every timestamp is stored UTC (already true) and rendered in
  the user's timezone from an explicit preference, not the browser guess alone. Relative formatting
  ("2 hours ago") localised. `sprints.startsOn`/`endsOn` and the ticket date fields are calendar
  dates, not instants, and must never be shifted by a timezone conversion — the bug that makes a
  sprint end a day early for half a team.
- Number, list and plural formatting through `Intl`. RTL layout support (logical properties
  throughout, mirrored icons).
- The API returns ISO-8601 with offset and never a pre-formatted date string.

## 5. Mobile & responsive

- The list, detail, notifications and personal queue (spec 27 §7) are fully usable on a phone; the
  board is usable in a single-column, per-status mode rather than a squeezed desktop board.
- Touch targets at 44px, swipe actions on list rows, a bottom navigation bar under the breakpoint.
- **PWA**: installable, an offline shell, and read-only offline access to recently viewed tickets
  with a queued-write banner. Full offline write sync is out of scope — a queued edit that conflicts
  three hours later needs the conflict UX from spec 26 §3 and is its own project.

## 6. Empty, loading, error and onboarding states

- Every list, board column, dashboard widget and search result gets a designed empty state with the
  action that resolves it. "No tickets" with a Create button beats a blank panel.
- Skeletons matching final layout, not spinners, so the page does not reflow on arrival.
- Error states use the `code` from spec 11 §3 to say something specific and offer a retry, with the
  `requestId` copyable for support.
- First-run: a guided project setup (name, key prefix, members, workflow, first ticket) and per-view
  coach marks, dismissible and never shown twice.
- A user-facing changelog / what's-new panel.

## 7. Consistency pass

An audit of every view against the shared component set: one button hierarchy, one form layout, one
table density model, one toast pattern, one confirmation-dialog pattern for destructive actions
(typed confirmation for project delete per spec 23 §6). Divergences accumulated across M8–M13 are
collected and fixed here rather than left as a permanent tax on every later change.

## Out of scope

Native mobile apps, a public design system package, and full offline write synchronisation.

## Acceptance criteria

- Every e2e flow in the Playwright suite is repeated keyboard-only and passes.
- `axe-core` reports zero violations on all views in both themes.
- A board card can be picked up, moved across columns and dropped using only the keyboard, with each
  step announced.
- Switching a user's timezone changes every rendered timestamp and changes **no** sprint or due date.
- Every string in the web app resolves through the i18n catalogue; the CI literal check passes.
- The board is usable at 375px width, verified by a mobile-viewport e2e run.
- Every list and board column in the app renders a designed empty state, enumerated by a test.
