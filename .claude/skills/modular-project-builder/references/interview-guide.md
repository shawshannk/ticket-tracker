# Interview Guide

Question checklist for Phase 1. Ask in small batches (2-3 related questions per turn). Skip anything already answered by provided docs or the conversation. The goal is to fill SPEC.md without guessing — not to ask every question below.

## 1. Purpose and users

- What does this project do, in one sentence?
- Who uses it? (just the user, a team, public users, interviewers looking at a portfolio)
- Is this a throwaway experiment, a portfolio piece, or something going to production? (This changes how much testing/infra rigor the plan needs — ask explicitly, don't infer.)

## 2. Functional requirements

- What are the 3-5 core flows? Walk through the main one step by step.
- For each flow: what's the input, what's the output, what can go wrong?
- Which requirements are must-have for v1 vs nice-to-have? Force a split — everything cannot be must-have.
- Any existing system this replaces or integrates with?

## 3. Out of scope

- What is this explicitly NOT? (not multi-tenant, no auth in v1, no mobile, etc.)
- Write the answers into SPEC.md verbatim. This list is what protects later sessions from scope creep.

## 4. Tech stack — ask, never assume

Ask each of these unless a provided doc already answers it:

- Language and framework for backend? For frontend (if any)?
- Database? (relational vs document vs none — and why, if they have a reason)
- Where does it run? (local only, Docker, cloud provider, serverless)
- Testing expectations? (unit tests per module, integration tests, none for a spike)
- Package/build tooling preferences?
- Any library the user specifically wants to use or avoid?

If the user says "you pick", pick something boring and mainstream for their stated language, state the choice and one-line reasoning, and record it in SPEC.md under "Decisions made on user's behalf".

## 5. Constraints

- Deadline or time budget?
- Cost constraints? (free tier only, existing cloud account)
- Existing code or repo to build inside?
- Anything the user already tried that didn't work?

## When to stop

Stop when every section of SPEC.md can be written without inventing facts. Two signals you've asked enough: the user's answers are getting shorter, or you're asking about things that only matter in module 6+. Details that only affect one module can be deferred to that module's session.