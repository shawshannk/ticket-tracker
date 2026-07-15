# Plan file templates

Three files live in `docs/plan/`. Pick the SPEC.md shape based on whether the project has one spec or per-module spec files — everything else is the same.

---

## SPEC.md — Shape A: single-spec project

```markdown
# <Project Name> — Spec

## Purpose
One or two sentences: what this is and who it's for.

## Requirements
- **R1**: <requirement> (must-have)
- **R2**: <requirement> (must-have)
- **R3**: <requirement> (nice-to-have)
<!-- Revisions get dated in place: -->
<!-- - **R2** — revised 2026-07-14: <new wording>. Was: <old wording> -->

## Tech stack
- Language/runtime:
- Framework(s):
- Database:
- Infra/deploy:
- Testing:

## Constraints
- <deadline, budget/free-tier, existing code to integrate with, ...>

## Out of scope
- <explicit non-goals — prevents scope creep in later sessions>

## Decisions
<!-- Promoted from module handoffs when a decision outlives its module. -->
- **D1** (<date>, from M<n>): <decision> — <one-line rationale>

## Decisions made on user's behalf
<!-- Only if the user said "just decide". Visible and reversible. -->
- <decision> — <why this call was made>
```

---

## SPEC.md — Shape B: multi-spec project (contract + index)

SPEC.md references the per-module spec files; it never duplicates their content. Per-module detail lives in `specs/NN-<module>.md`.

```markdown
# <Project Name> — Spec (contract & index)

## Purpose
One or two sentences: what this is and who it's for.

## Spec sources
| Module | Spec file | Fingerprint (as of) |
|--------|-----------|---------------------|
| M1 <name> | specs/01-<name>.md | 2026-07-15 |
| M2 <name> | specs/02-<name>.md | 2026-07-15 |
<!-- Fingerprint = last-modified date or commit hash of the spec file
     at the time PLAN.md was (re-)derived from it. Update on every
     spec-level change. Phase 3 checks current files against these. -->

## Cross-module contracts
<!-- The things no single spec file owns. A change here affects every
     dependent module, not just one. -->
- **Shared types/models**: <e.g. Message, UserProfile — canonical shape and owner module>
- **Interface boundaries**: <e.g. M2 consumes M1's IAuthService; contract: ...>
- **Module dependency order**: M1 → M2 → M3 (M4 independent)

## Shared requirements
<!-- Requirements that span modules. Module-specific ones stay in their spec file. -->
- **R1**: <cross-cutting requirement, e.g. all APIs return problem+json errors>

## Tech stack
- Language/runtime:
- Framework(s):
- Database:
- Infra/deploy:
- Testing:

## Constraints
- <...>

## Out of scope
- <...>

## Decisions
- **D1** (<date>, from M<n>): <decision> — <one-line rationale>

## Decisions made on user's behalf
- <decision> — <why>
```

---

## PLAN.md

```markdown
# <Project Name> — Plan

Derived from spec as of: <date / commit>  <!-- must match PROGRESS.md fingerprint -->

## Modules

### M1: <name> (S/M/L)
- **Goal**: <one sentence>
- **Source spec**: specs/01-<name>.md   <!-- multi-spec projects only -->
- **Reference material**: reference/<file> — <what it shows, e.g. "existing static site, layout/nav behavior">  <!-- omit if none applies to this module -->
- **Files**: <files this module will create/touch>
- **Acceptance criteria**:
  - <build passes / specific test / manual check — concrete, verifiable>
- **Depends on**: — (or M<n>)

### M2: <name> (S/M/L)
- ...

<!-- Modules sized to fit one session: one coherent vertical slice or one
     infrastructure concern. If it feels L, split it. -->

## Backlog
<!-- Parked ideas from mid-build. One line each, dated. Triaged at Phase 5. -->
- 2026-07-15: <idea> (raised during M3)
```

---

## PROGRESS.md

```markdown
# <Project Name> — Progress

**Spec fingerprint**: PLAN.md derived from spec files as of <date / commit>.
<!-- Phase 3 compares current spec files against this before resuming.
     Updated whenever a spec-level change is processed. -->

## Module status
| Module | Status | Spec source (fingerprint) | Completed |
|--------|--------|---------------------------|-----------|
| M1 <name> | done | specs/01-<name>.md (2026-07-15) | 2026-07-16 |
| M2 <name> | in-progress | specs/02-<name>.md (2026-07-15) | — |
| M3 <name> | pending | specs/03-<name>.md (2026-07-15) | — |
<!-- Single-spec projects: spec source column is just SPEC.md (date). -->

## Handoff log

### M1: <name> — done, 2026-07-16
- **Built against**: specs/01-<name>.md as of 2026-07-15
- **Files**: <created/modified>
- **Decisions**: <what and why, esp. deviations from plan/spec.
  Promoted to SPEC.md ## Decisions: D1>
- **Gotchas / open issues**: <what the next session must know>
- **Plan changes**: <none, or what changed in PLAN.md and why>

### M2: <name> — WIP handoff, 2026-07-17
- **State**: X works, Y not started. Resume at <file>.
- **Committed as**: `M2 WIP: <summary>`

## Completion (Phase 5)
<!-- Written once, when all modules are done. -->
- **End-to-end verified**: <full build, test suite, primary flows exercised>
- **Known limitations**: <...>
- **Backlog triage**: <shipped as M<n> / deferred / dropped, per item>
- **Tagged**: v1.0
```
