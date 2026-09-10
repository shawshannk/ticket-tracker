# 27 — Intelligence & Insights

The differentiators. Everything here is optional, degrades to a useful non-AI behaviour, and is
inert when `AI_ENABLED=false` — a tracker whose core loop depends on a model API call is a tracker
that stops working when someone else's service does.

Ground rules for the whole module:
- **Suggestions, never silent writes.** Every AI output is proposed and accepted by a human, except
  where a project explicitly opts into automation (spec 22 §3), and every applied suggestion is
  recorded as an event with `metadata.source = 'ai'` so the timeline never misattributes it.
- **Permission-scoped context.** A model call may only be given data the requesting user can already
  read. Assembling context from a full-corpus query and filtering afterwards is the leak.
- Data sent to a provider is configurable and auditable; an instance can disable the feature per org.

## 1. AI triage (assist on create)

On the create form and on inbound-email tickets (spec 26 §5), suggest type, priority, severity,
labels, component/custom-field values and an assignee, from the title and description.

- Assignee suggestions come from history: who resolved similar tickets, current load, and project
  membership — never from anything resembling a personal characteristic.
- Each suggestion shows its basis ("3 similar tickets went to Sam") and is one click to accept or
  dismiss. Dismissals are recorded and are the evaluation signal.
- A deterministic fallback ships first and stays: nearest-neighbour over the existing full-text index
  (spec 17) with a label-frequency prior. It is measurably worse and always available.

## 2. Duplicate detection

Embeddings over title + description in **pgvector**, refreshed on write by a job, exposed through the
same `SearchService` interface spec 17 §1 defines.

- At create time, "3 similar tickets exist" with inline previews before submission — the point of
  intervention that actually prevents a duplicate.
- On an existing ticket, a similar-tickets panel and a one-click `duplicates` link (spec 20 §2).
- Tuned for **precision over recall**: a false duplicate suggestion that interrupts someone mid-report
  costs more than a missed one.

## 3. Summarisation

- **Ticket summary**: a long comment thread reduced to decisions, open questions and current state.
  Cached and invalidated by comment count so the same thread is not re-summarised on every open.
- **Standup digest**: per team, per morning — what moved, what is newly blocked, what is stuck, what
  is at risk this sprint. Generated from spec 12's events, delivered by spec 14's channels and spec 26
  §4's chat integration. This reads far better than a burndown and is the feature most likely to be
  used daily.
- **Release notes prose** (spec 24 §2), over the deterministic grouped output.
- **Sprint retro input**: what changed scope mid-sprint, what carried over, where cycle time spiked.

## 4. Rot detection

Pure analytics, no model required, and the report nobody else does well: your backlog is lying to you.

- Tickets untouched for N days, grouped by owner and by status.
- Tickets carried across three or more sprints.
- Epics whose children are all complete but which are themselves open.
- Assignees with more in-progress work than anyone can hold at once.
- Blocked tickets whose blocker closed.
- "In Review" older than the team's median review time.
- Delivered as a weekly report (spec 21 §3) and a project health panel, each row one click from a
  bulk fix (spec 20 §6).

## 5. Estimate calibration

From history rather than exhortation: per size and per assignee, the distribution of actual cycle
time against estimate, and the team's own error factor. Shown at estimation time as
"stories sized M have taken 3–11 days, median 6" — a range, never a prediction, because a point
estimate presented as a forecast is the failure mode this replaces.

Feeds spec 24 §4's forecast, also as a range with a confidence band.

## 6. Blocked-chain analysis

Over spec 20 §2's `blocks` graph (acyclic by construction): the critical path to a version or sprint,
and the single ticket transitively blocking the most work. A "top blockers" panel ranked by blocked
work, not by blocker count — one ticket holding an epic outranks one holding three trivia.

## 7. Personal work queue

A cross-project "my day": everything assigned to or watched by the caller, ranked by blocker status,
sprint commitment, due date and staleness, with a focus mode showing one ticket at a time. This is the
view most people would open first, and it does not exist in any form today because every query in the
product is project-scoped.

## 8. Meeting mode

A presentation view for standup and grooming: one ticket at a time, keyboard-driven
(`j`/`k`/`e`/`a`/`s`), edits committed inline, a running "covered/remaining" indicator, and an
optional live-shared cursor over spec 26 §1 so everyone's screen follows the facilitator.

## 9. Model plumbing

- One `AiProvider` interface; the default implementation targets the Claude API. Model ids are
  configuration, never hardcoded in feature code.
- Prompts are versioned files, not inline strings, so a change is reviewable and a regression is
  bisectable.
- Cost and latency budgets per feature, a per-org monthly cap, and every call logged with tokens,
  latency, model and outcome.
- Timeouts short and failures silent: an unavailable provider hides the suggestion; it never blocks a
  create, a transition or a save.
- An eval set of real tickets with expected classifications, run in CI, so prompt changes are measured
  rather than argued about.

## Out of scope

Autonomous agents that write code or close tickets unattended, and training/fine-tuning on customer
data.

## Acceptance criteria

- With `AI_ENABLED=false`, every view renders and every deterministic fallback works; no request
  fails and no suggestion UI appears.
- A model call is never issued with a ticket the requesting user cannot read — asserted by a test
  that inspects the assembled context for a cross-project case.
- An accepted suggestion writes an event tagged `source: 'ai'`; a dismissed one writes nothing but
  the dismissal signal.
- Duplicate detection on a seeded near-duplicate pair returns the pair; on 100 unrelated tickets it
  returns nothing (precision test).
- The rot report's six rules each have a unit test over a hand-built fixture.
- A provider timeout of 30s leaves ticket creation unaffected and under its normal latency budget.
