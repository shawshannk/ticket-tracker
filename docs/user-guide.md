# Ticket Tracker — User Guide

Everything you can do, from opening your invite to running a project's membership — and the
handful of rules the server enforces whatever the screen shows you.

This describes the app **as it ships**: real sign-in, no acting-as switcher. Rules marked
**Server rule** are enforced by the API, so they hold however you reach it. If something here
does not match what you see, the app is right and this page needs correcting.

> For operators rather than users — environment variables, the dev-impersonation flag, CSP —
> see [`README.md`](../README.md) and [`docs/auth-tech-spec.md`](auth-tech-spec.md).

## Contents

1. [Your first ten minutes](#your-first-ten-minutes)
2. [Accepting an invite](#accepting-an-invite)
3. [Signing in](#signing-in)
4. [Getting around](#getting-around)
5. [Roles and what you can do](#roles-and-what-you-can-do)
6. [Overview](#overview)
7. [Tickets list](#tickets-list)
8. [Board](#board)
9. [Creating a ticket](#creating-a-ticket)
10. [Working on a ticket](#working-on-a-ticket)
11. [Comments](#comments)
12. [People](#people)
13. [Project members](#project-members)
14. [Your account](#your-account)
15. [When something looks wrong](#when-something-looks-wrong)
16. [Field reference](#field-reference)

---

## Your first ten minutes

Four steps from an invite link to knowing where everything is.

1. **Open your invite link and set a password.** An administrator sends you a link ending in
   `/invite/…`. Opening it shows the email address you were invited as, and asks you to choose a
   password. Setting it signs you in immediately — there is no separate confirmation step.
2. **Land in a project.** You go straight to the Overview of the first project you belong to. If
   you belong to none, you see a short message saying so; ask an administrator to add you to one.
3. **Look at the sidebar.** The project name sits at the top and switches projects. Below it are
   the five views — Overview, Tickets, Board, People, Members — then the **New Ticket** button.
   Your own name is at the bottom.
4. **Open a ticket.** Go to Tickets and click any row. That detail view is where most of the work
   happens: change fields, save, and comment.

## Accepting an invite

How accounts start. There is no sign-up page — every account is created by an administrator.

Your invite link works once and expires after seven days. The page shows the email address the
invite was issued for, so you can check it is really yours before setting a password.

**What makes a valid password.** The page checks these as you type, and the server checks them
again:

- At least **12 characters**. There are no rules about symbols or digits.
- Not based on your own email address.
- Not one of the commonly used passwords on the bundled list.

> **⚠ Careful.** The link is shown to the administrator exactly once and is not stored anywhere
> they can look it up again. If you lose it or it expires, they cannot resend the same link — they
> issue a new invite, which quietly cancels the old one.

If the link has already been used, has expired, or was mistyped, you get one message saying it is
no longer valid. That message is the same in all three cases on purpose, so the page cannot be
used to work out which links exist.

## Signing in

Email and password at `/login`. Every other page redirects here if you are not signed in.

If you follow a link to a page while signed out — say a colleague sends you a ticket URL — you
land on the login page and are returned to that exact page once you sign in.

> **Server rule.** A failed sign-in always says *"Email or password is incorrect."* — whether the
> address is unknown, the password is wrong, the invite was never accepted, or the account is
> disabled. One message for all four, so the form cannot be used to discover who has an account.

Ten failed attempts for the same address within fifteen minutes will temporarily stop further
attempts. Wait, then try again.

**Staying signed in.** Closing the tab does not sign you out; reopening the app picks up where you
left off. If your session does end while you are working, you are returned to the login page with
*"Your session expired — please sign in again."* and sent back to what you were doing after
signing in.

## Getting around

**The project switcher** sits at the top of the sidebar. It lists **only the projects you are a
member of**. If you are a platform administrator it lists every project, marked
`All projects · platform admin` so you know why the list is longer than everyone else's.

**The five views:**

| View | What it is |
|---|---|
| Overview | Counts, breakdowns and recent activity for the project. Read-only. |
| Tickets | The filterable, searchable table of everything in the project. |
| Board | The same tickets as draggable cards in status columns. |
| People | Everyone in the organisation — not just this project. |
| Members | Who belongs to *this* project, and as what. |

**Your account menu.** Your name and role sit at the bottom of the sidebar. Clicking opens *Your
profile*, *Change password*, *Active sessions*, *Log out* and *Log out everywhere*.

> **Worth knowing.** Every view lives at its own address. A board filtered to a sprint, a ticket
> list filtered to open bugs — the filters are in the URL, so you can bookmark or paste either one
> and your colleague sees the same view. Display preferences like row density are not in the URL;
> they stay on your machine.

## Roles and what you can do

The one thing about this app that surprises people: you have two roles, and the project one
usually wins.

Your **global role** governs organisation-wide things — managing user accounts and creating
projects. Your **project role** governs everything inside a single project, and it can be
different in every project you belong to. You might be a manager on Atlas Billing and a developer
on Vega Mobile.

> **Server rule.** Inside a project, your project role decides what you can do — not your global
> role. A global manager who joined a project as a developer cannot create epics there. It also
> works the other way: a global developer added as a project manager can.
>
> The one exception is a **platform administrator**, who acts as an admin in every project whether
> or not they were added to it.

### Inside a project

| Action | admin | manager | developer |
|---|:--:|:--:|:--|
| Read tickets, board, overview, sprints | Yes | Yes | Yes |
| Create a story or bug | Yes | Yes | Yes |
| Create an epic | Yes | Yes | **No** |
| Edit a ticket's fields | Yes | Yes | Yes |
| Move a ticket's status | Yes | Yes | Yes |
| Change who a ticket is assigned to | Yes | Yes | Only if you reported it or hold it |
| Delete a ticket | Yes | Yes | Only if you reported it |
| Comment | Yes | Yes | Yes |
| Edit a comment | Author only | Author only | Author only |
| Delete a comment | Author, or a project admin | Author only | Author only |
| Add, remove and re-role members | Yes | Yes | **No** |

### Across the organisation

Only a global administrator can create user accounts, edit them, disable them, or create new
projects. Everyone can see the People directory, but **email addresses are shown only to
administrators** — and to you, on your own record.

> **Server rule.** Hidden buttons are a convenience, not the control. Every rule above is checked
> again on the server, so nothing is reachable by guessing a URL.

## Overview

The landing view for a project. Nothing here is editable.

| Figure | Meaning |
|---|---|
| Open tickets | Everything not yet in `Done`. |
| Critical open | Open tickets at `critical` priority. |
| Avg. resolution days | Mean time from creation to reaching `Done`. |
| Created this week | Tickets opened in the last seven days. |

Below the four figures: a breakdown by status and by priority with counts and percentages, and the
five most recently updated tickets. Commenting on a ticket counts as activity, so a discussion
moves a ticket up that list without anyone changing a field.

## Tickets list

The main table. Newest first, twenty-five per page.

**Filters.** Six dropdowns, each defaulting to "all": *All statuses*, *All priorities*, *All
assignees*, *All environments*, *All epics*, *All types*. They combine — every filter you set
narrows the result further. The count above the table reads `X of Y tickets` so you can see how
much you have narrowed it.

**Search.** The search box matches, case-insensitively, on three things only: the ticket
**title**, its **key** (so typing `NIM-14` finds that ticket), and the **assignee's name**. It
does not search descriptions or comments.

**Display toggles:**

| Toggle | Effect |
|---|---|
| Comfortable / Compact | Row height only. Compact fits noticeably more on screen. |
| Hierarchy | Shows the `Epic ▸ Story` breadcrumb on each row. |
| Tags | Switches labels between colour-coded and plain. |

These three are yours alone — they are remembered on your machine and are not part of the URL you
share.

## Board

The same tickets as cards. Drag a card to a new column to change its status.

**The columns change with the Type filter.** This is deliberate, because the three ticket types do
not share a workflow:

| Type filter | Columns |
|---|---|
| All | Backlog · Planned · In Progress · In Review · Blocked · On Hold · Done |
| Epic | Planned · In Progress · Done |
| Story or Bug | Backlog · In Progress · In Review · Blocked · On Hold · Done |

There is also a **Sprint** filter: all sprints, the backlog, or one named sprint.

> **Server rule.** A status has to be valid for that ticket's type. `Planned` belongs to epics, so
> a bug cannot be dropped there — the board will not let you, and the server would refuse it
> anyway. If a move is ever rejected, the card snaps back rather than showing a status that did not
> save.

## Creating a ticket

*Who: admin, manager, developer (stories and bugs only).*

Click **New Ticket** in the sidebar and pick a type. Which fields you see depends on that choice:

| Field | Epic | Story | Bug |
|---|:--:|:--:|:--:|
| Title, description, assignee, labels | Yes | Yes | Yes |
| Priority | Defaults to medium | Yes | Yes |
| Environment, size, dates, sprint | — | Yes | Yes |
| Parent epic *(required)* | — | Yes | Yes |
| Severity | — | — | Yes |
| Linked story *(optional)* | — | — | Yes |

Every story and bug needs a parent epic, so a project with no epics yet needs one created first.
If you are a developer and cannot create it, ask a manager. When a bug is linked to a story, the
story list is filtered to stories under the epic you chose — the two links have to agree.

Submitting takes you straight to the new ticket. Its key is assigned automatically from the
project's prefix — `NIM-1`, `NIM-2` and so on — and you are recorded as the reporter.

## Working on a ticket

**What you can change:** status, priority, assignee, environment, size, start date, estimated end
date, sprint, parent epic, and — on a bug — the linked story.

**What you cannot:** the description, the reporter, the labels, the created date and the ticket's
type are fixed once it exists. A ticket cannot change type.

**Saving.** Edits are held locally until you press **Save changes**; the button stays greyed out
until something actually differs, then briefly reads *Saved ✓*. Navigating away without saving
discards the edits.

> **Server rule.** *Reassignment is narrower than editing.* Any member can fix a label or a size on
> anyone's ticket — a tracker where you cannot correct someone else's typo is one people work
> around. But moving a ticket to a different person is limited to project managers, the reporter,
> and whoever currently holds it, because reassignment makes work disappear from someone's queue
> without their knowledge.

**Deleting.** *Who: project admin, project manager, or the ticket's reporter.* **Delete ticket**
appears only if you may use it, and asks for confirmation. Comments on the ticket go with it.

> **⚠ Careful.** A ticket other tickets still link to cannot be deleted. Deleting an epic with
> stories under it is refused, and the message names the tickets in the way — detach or delete
> those first. This is to stop real work being silently orphaned.

## Comments

At the bottom of every ticket, newest activity last.

Type in the box and press **Comment**. You are recorded as the author — there is no way to post as
someone else. Commenting counts as activity on the ticket, so it moves up the Overview's recent
list.

> **Server rule.** **Nobody can edit another person's comment — not even an administrator.** A
> comment is attributable speech, and altering one while leaving someone else's name on it is not
> something the system allows. A project administrator *can* delete a comment, which is moderation
> rather than impersonation.

## People

Everyone in the organisation. Global, not per-project.

Anyone can open the directory and see names, departments and roles — those are what assignee and
author labels are drawn from. Email addresses are visible only to administrators, and to you on
your own record.

**Adding someone.** *Who: global admin.* **Add team member** creates the account and issues an
invite link in one step. The link appears once, on the confirmation panel, with a **Copy** button.
Send it to the person yourself — the app does not send email.

> **⚠ Careful.** Do not leave that page before copying the link. It is stored only as a fingerprint
> and cannot be shown again; leaving without it strands an account nobody can activate. The fix is
> to issue a new invite, which cancels the old one.

Until the invite is accepted the account shows as `invited` and cannot sign in.

**Disabling someone.** *Who: global admin.* Accounts are never deleted — their name has to keep
resolving on the tickets they reported and the comments they wrote. Disabling is how someone
leaves. Open their record and press **Disable**.

> **Server rule.** Disabling takes effect on that person's **very next request**, not when their
> session would have expired. They are signed out of every device at once. Re-enabling restores
> access from their next sign-in.
>
> You cannot disable yourself, and the system refuses any change that would leave it with no active
> administrator.

## Project members

*Who can change this: project admin, project manager. Any member can see the table.*

Membership is what makes a project visible. Pick someone from the directory, choose their role *in
this project* — it defaults to their global role — and press **Add member**. Change a role with
the dropdown on their row; press **Remove** to take them out.

Both take effect on that person's next request. Removing someone leaves their tickets and comments
exactly where they are; they simply stop being able to see the project.

> **Server rule.** A project always keeps at least one project administrator. The last one's
> **Remove** button is disabled and their role cannot be lowered — promote someone else first.

> **Worth knowing.** Someone who is not a member does not get a "no access" message — the project,
> its tickets and its board simply report **not found**, exactly as a mistyped address would. That
> is intentional: it means nobody can discover which projects exist by watching which ones refuse
> them.

## Your account

**Change password.** Your current password, then the new one twice. The same three rules from the
invite page apply.

> **⚠ Careful.** Changing your password signs you out **everywhere else** — every other browser and
> device. The device you are on stays signed in.

**Active sessions.** Every device you are signed in on, with its browser, address and when it
started. The one you are using is marked *This device* and has no sign-out button — use **Log out**
for that. Any other row can be ended with **Sign out**, which takes effect on that device's next
request.

**Logging out.** **Log out** ends this device's session. **Log out everywhere** ends all of them,
which is what to use if you think someone else has your password — then change it.

## When something looks wrong

| What you see | What it means |
|---|---|
| Sent back to the login page mid-task | Your session ended — a password change, a sign-out elsewhere, or an administrator disabling the account. Sign in again and you return to the page you were on. |
| A project URL says **not found** | Either it does not exist or you are not a member. The two look identical by design. Ask to be added. |
| A button you expected is missing | Your role in *this* project does not allow it — which may differ from your role elsewhere. Check **Members** to see what you hold here. |
| "Only the reporter or a project manager can delete this ticket" | You are a developer and someone else reported it. Ask them, or a project manager. |
| A card snaps back to its old column | That status is not valid for that ticket's type — epics and stories have different workflows. |
| "A project must keep at least one admin." | You are removing or demoting the last project administrator. Promote someone else first. |
| Sign-in refuses repeatedly, then stops responding | Too many attempts for that address. Wait fifteen minutes. |
| Your invite link "is no longer valid" | Used, expired after seven days, or mistyped. Ask for a new one. |

## Field reference

### Statuses, by ticket type

| Type | Statuses |
|---|---|
| Epic | Planned · In Progress · Done |
| Story | Backlog · In Progress · In Review · Blocked · On Hold · Done |
| Bug | Backlog · In Progress · In Review · Blocked · On Hold · Done |

A new ticket starts in the first status for its type — epics in `Planned`, stories and bugs in
`Backlog`. You cannot set the starting status yourself.

### Priority and severity are different things

| Field | Values | Meaning |
|---|---|---|
| Priority | `critical` `high` `medium` `low` | How urgently it should be worked on. Every ticket has one. |
| Severity | `1` `2` `3` `4` | How badly a defect behaves, 1 being worst. Bugs only. |

### Other fields

| Field | Values |
|---|---|
| Size | `xs` `s` `m` `l` `xl` — rough effort. Stories and bugs. |
| Environment | `production` `staging` `development`. Stories and bugs. |
| Key | The project prefix and a number — `NIM-14`. Assigned on creation, never reused, and searchable. |
| Sprint | A named sprint or the backlog. Filters the board. |
| Labels | Free-text tags set at creation. |

### Account states

| State | Meaning |
|---|---|
| `invited` | Created but the invite has not been accepted. Cannot sign in. |
| `active` | Normal. |
| `disabled` | Signed out everywhere and blocked from signing in. Their name still appears on their old tickets and comments. |
