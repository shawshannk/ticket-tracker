---
name: modular-project-builder
description: Interview-driven project builder that turns an idea into a persistent spec, a modular implementation plan, and then implements modules one session at a time so context/tokens never run out. Use this skill whenever the user wants to start building a new project, app, service, or sizable feature ("let's build X", "new project", "I have an idea for"), whenever they ask to resume or continue implementation of a planned project ("continue where we left off", "next module", "resume the build"), or whenever a docs/plan/ directory with SPEC.md, PLAN.md, or PROGRESS.md exists in the repo. Also use it when the user provides existing spec documents (single or multiple per-module spec files) and wants them implemented, or when they complain about running out of context mid-build and want a structured way to split work across sessions.
---

# Modular Project Builder

Turn a project idea into three persistent files (SPEC, PLAN, PROGRESS), then implement the plan module by module across multiple sessions. The files on disk are the memory. Each session should be able to start fresh, read those three files plus the current module's code, and continue with zero archaeology of old conversations.

## Why this exists

Long build conversations exhaust context. The fix is not "be brief" but externalize state: requirements and decisions live in files, not chat history. A new session that reads `docs/plan/` knows everything it needs. Treat updating those files as part of the work, not an afterthought — a module is not done until PROGRESS.md says what happened.

## Phase 0: Detect state (always do this first)

Check whether `docs/plan/PROGRESS.md` exists in the repo.

- **Exists** → this is a RESUME session. Go to Phase 3.
- **Doesn't exist** → this is a NEW PROJECT session. Go to Phase 1.

If the user explicitly asks to re-plan or restart, confirm before overwriting any existing plan files.

## Phase 1: Requirements and stack interview

Goal: enough clarity to write SPEC.md. Not a full BRD — just what's needed to decide modules and make the first architectural calls.

**Two entry modes:**

**A. Project docs exist (README, design doc, uploaded spec — single file or multiple).** Read them first. If multiple spec files exist (one per module or domain), read ALL of them plus any overview/architecture doc before summarizing — do not summarize from a partial read. Extract everything you can: purpose, functional requirements, tech stack, constraints, and (for multi-spec) the module boundaries and dependencies implied by the file split. Then present the extraction as a prefilled summary and ask for confirmation, e.g. "From your README I'm assuming: .NET 8 API, Next.js frontend, Postgres, deployed to AWS. Requirements R1..R5 as listed below. Confirm, correct, or add." Only ask about genuine gaps.

For multi-spec projects, do NOT merge the spec files into one SPEC.md. Keep them where they are (or move them under `specs/` if they're loose uploads) and preserve the per-module source mapping — SPEC.md becomes a contract/index file that references them (see Phase 2). If the spec files disagree with each other (conflicting types, duplicate requirements, incompatible assumptions between modules), surface the conflicts to the user during this phase — never resolve a cross-spec conflict silently.

Also check for a `reference/` folder (existing sites, mockups, working prototypes, screenshots). Treat anything in `reference/` as behavioral/visual reference, not requirements — it shows how something should look or behave, it does not define what must be built. Read it alongside the specs, but if it disagrees with a spec file (different flow, different field, different behavior), surface the discrepancy to the user rather than assuming the reference wins — the user decides which is authoritative. Note any reference material used in SPEC.md (or the module's entry in PLAN.md) so later sessions know it was consulted.

**B. No docs.** Interview from a blank slate. Do NOT assume a stack from prior conversations or user history — each project starts blank. Ask in small focused batches (2-3 related questions max per turn, never a wall of questions). Read `references/interview-guide.md` for the full question checklist. Cover, in order:

1. What the project does and who it's for (one-sentence positioning)
2. Functional requirements (core flows, must-have vs nice-to-have)
3. Explicit out-of-scope list (prevents scope creep in later sessions)
4. Tech stack (language, framework, DB, infra, testing) — ask, don't assume
5. Constraints (deadlines, existing code to integrate with, budget/free-tier requirements)

Stop interviewing when you can write every SPEC.md section without guessing. If the user says "just decide", make the call, but record it in SPEC.md under "Decisions made on user's behalf" so it's visible and reversible.

## Phase 2: Write the plan files and get approval

Create `docs/plan/` with three files. Templates are in `references/templates.md` — read that file before writing them.

- **SPEC.md** — what and why. Two shapes depending on the project:
  - **Single-spec project**: full spec in one file. Requirements (numbered R1, R2...), stack, constraints, out-of-scope. Changes rarely.
  - **Multi-spec project**: SPEC.md is the cross-module contract and index, NOT a merged copy of the per-module specs. It holds: overall purpose, shared requirements, tech stack, constraints, out-of-scope, cross-module contracts (shared types, interface boundaries, module dependency order), and a **Spec Sources table** mapping each module to its source spec file with a fingerprint (e.g. `M2 messaging → specs/02-messaging.md — as of 2026-07-15`). Per-module detail stays in the per-module files; SPEC.md references, never duplicates.
  - Either shape also holds a "## Decisions" section for decisions that outlive a single module (see Phase 4).
- **PLAN.md** — how. Modules (numbered M1, M2...) in dependency order. For multi-spec projects, dependency order comes from the cross-module contracts in SPEC.md, not from spec file numbering. Each module has: goal, source spec file (multi-spec only), reference material consulted (if anything in `reference/` applies to this module), files it will touch/create, acceptance criteria (how we know it's done — build passes, specific test, manual check), and estimated size (S/M/L). Modules should be sized so one module fits comfortably in one session: roughly "one coherent vertical slice or one infrastructure concern". If a module feels L, split it.
- **PROGRESS.md** — state. Header records the **spec fingerprint**: the date (or commit) of the spec files that PLAN.md was derived from — this is what Phase 3 checks against. Then a module checklist with status (pending / in-progress / done); each module entry records the source spec file + fingerprint it was built against (multi-spec), plus a per-module handoff log written at completion time.

If the repo is not a git repo, run `git init` now, before writing any code, and add a `.gitignore` appropriate to the stack (e.g. `bin/`, `obj/`, `node_modules/`, `.env`) before the first commit. Commits are the only rollback path this skill has.

Present the module breakdown to the user and **get explicit approval before writing any code**. The user may reorder, merge, or split modules. Do not start M1 in the same breath as presenting the plan.

## Phase 3: Resume session

1. Read SPEC.md, PLAN.md, PROGRESS.md. Do not re-read the whole codebase — read only the files listed in the current/next module plus anything the handoff notes flag.
2. **Reconcile before trusting.** PROGRESS.md is a claim, not a fact — the previous session may have died mid-write. Verify:
   - `git log --oneline -5` and `git status`: the last commit should correspond to the last module marked done. Uncommitted code changes mean the previous module is incomplete regardless of what PROGRESS.md says.
   - **Spec drift check**: compare the spec files' current state (last-modified dates, or `git log -- <spec files>` if they're tracked) against the spec fingerprint in PROGRESS.md. The user may have edited spec files between sessions, outside any conversation. If any spec changed since PLAN.md was derived, stop: summarize the diff, route it through the "Spec-level" branch of the mid-build change protocol (triage impact, present blast radius, get approval), update the fingerprint, and only then resume. Never implement against a PLAN.md derived from a spec that no longer says what it said.
   - Spot-check the last handoff's file list — those files exist and match what the handoff claims.
   - Run the build. A "done" module on a broken build means the handoff is stale.
   If any check fails, stop. Report the discrepancy, propose a corrected PROGRESS.md, and get the user's confirmation before touching code. Never silently fix forward from unverified state.
3. Give the user a 3-5 line status summary: modules done, what's next, any open issues flagged in the last handoff.
4. Confirm the next module (or let them pick a different one) before starting.

## Phase 4: Implement a module

1. **Ask session scope first, every session**: "How many modules this session — just M4, or keep going until you say stop?" Never assume. The user decides per session.
2. Implement the module. Follow the acceptance criteria in PLAN.md as the definition of done. For multi-spec projects, the module's source spec file is the detailed requirement source; SPEC.md's cross-module contracts constrain it. If they conflict, stop and ask — don't pick one silently.
3. **Verify**: run the build, run the module's tests, or perform the manual check named in the acceptance criteria. If no build exists yet (e.g. M1 of a fresh project is scaffolding), the acceptance criterion is the manual check alone — but from the first module that produces buildable code onward, "it compiles" is the floor. A module that doesn't compile is not done.
4. **Commit the module's code, then write the handoff in PROGRESS.md, then commit the handoff, before declaring the module complete.** The handoff covers:
   - Status → done, with date
   - Source spec file + fingerprint the module was built against (multi-spec projects)
   - Files created/modified
   - Key decisions made and why (especially deviations from PLAN.md or the module's spec file)
   - If a decision outlives this module (interface contract, library choice, pattern other modules must follow), promote it to the "## Decisions" section in SPEC.md — don't leave it buried in the handoff log
   - Gotchas or open issues the next session must know
   - Anything that changed in PLAN.md as a result (update PLAN.md too if module scope shifted)
5. Report to the user: what was built, what was verified, what's next. Then either continue (if they asked for multiple modules) or stop cleanly.

If context is getting long mid-module, finish the smallest coherent piece, commit whatever compiles with an `M<n> WIP:` prefix, write an honest in-progress handoff ("M4 half done: X works, Y not started, resume at file Z"), and tell the user this is a good point to start a fresh session.

## Phase 5: Completion (when the last module is done)

Modules being individually done is not the project being done. When PROGRESS.md shows every planned module complete:

1. **End-to-end verification.** Run the whole system together: full build, full test suite, and the primary user flow(s) from SPEC.md exercised manually or via an integration check. Individual module acceptance criteria never covered integration — this step does.
2. **Backlog triage.** Walk the "## Backlog" section of PLAN.md with the user, item by item: ship now (becomes a new module — the mid-build change protocol applies), defer (stays in backlog, explicitly), or drop (delete with a one-line reason). Don't let parked ideas silently rot.
3. **Close out.** Write a final entry in PROGRESS.md: project status, what was verified end-to-end, known limitations, deferred backlog. Commit, and tag the release (`git tag v1.0` or similar) so "the version where everything worked" is findable later.
4. If the user adds new work after this point, it's not a special case: new requirements get new R-numbers in SPEC.md, new modules get new M-numbers in PLAN.md, and the normal phase cycle continues. Completion is a checkpoint, not a lock.

## Handling mid-build changes and new ideas

When the user raises a new requirement, idea, or change mid-build, never just start coding it. Follow this protocol:

1. **Park, don't drop.** If a module is currently in progress, finish it (or reach a clean stopping point) first. Record the idea immediately in a "## Backlog" section at the bottom of PLAN.md — one line each, dated — so it survives even if the session ends here.

2. **Triage the impact.** Classify the change:
   - **Forward-only** — affects only modules not yet built. → Amend the affected upcoming modules in PLAN.md, or add new ones. Note the change in PROGRESS.md.
   - **Retroactive** — requires modifying code from completed modules. → Do NOT silently edit finished code. Create an explicit rework module (e.g. "M7: rework M2 data layer for multi-tenant"), with its own acceptance criteria and handoff, and slot it into PLAN.md in dependency order. Completed modules' handoffs stay untouched — they were true when written; the rework module's handoff records what changed and why.
   - **Spec-level** — changes what the project fundamentally does. → Amend the spec first: in a single-spec project, edit SPEC.md (new requirements get new numbers (R6), changed ones get marked revised with a date (R2 — revised 2026-07-14: ...)). In a multi-spec project, edit the affected per-module spec file(s) the same way, update the Spec Sources fingerprints in SPEC.md, and check whether the change ripples through the cross-module contracts — a contract change affects every module that depends on it, not just the one whose spec file changed. Then re-derive the affected parts of PLAN.md and update the spec fingerprint in PROGRESS.md. Never let the spec files and PLAN.md disagree.

3. **Present impact before implementing.** Same gate as Phase 2: show the user what the change costs — which modules are affected, what gets reworked, what gets pushed later — and get approval before writing code. A one-line idea can have a three-module blast radius; the user decides with that visible, not after.

4. **Small changes stay small.** If the change is genuinely trivial (rename, config value, copy tweak) and touches only the current module, just do it and mention it in the handoff. Don't invoke this protocol for things that don't need it.

## Rules that hold across all phases

- Never write code before the plan is approved. Never mark a module done without verification.
- One module at a time. Do not "quickly also do M5" unless the user asked for it this session.
- Keep answers honest: if a user requirement is a bad idea (wrong tool, unnecessary complexity), say so directly during the interview, propose the alternative, and let them decide.
- PLAN.md is living: if reality diverges (a module splits, a dependency appears), update it and note the change in PROGRESS.md. Stale plans are worse than no plans. For user-initiated changes and new ideas, follow "Handling mid-build changes" above.
- In multi-spec projects, the per-module spec files are the detailed source of truth for their modules and SPEC.md is the source of truth for everything cross-module. Neither overrides the other silently — conflicts go to the user.
- Git is the rollback path. At module completion, commit in this order: code committed → handoff written in PROGRESS.md → handoff committed. Never write the handoff before the code is committed — a handoff describing uncommitted work is documentation of something that can still be lost. Message format: `M<n>: <module name> — <one-line summary>`. On a mid-module stop, commit whatever compiles with an `M<n> WIP:` prefix before writing the in-progress handoff. Never end a session with uncommitted work.
