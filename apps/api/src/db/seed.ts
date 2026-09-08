import 'dotenv/config';
import { createDb } from './index';
import { projects, sprints, users } from './schema';

// Values from the prototype's seedUsers() / DEPARTMENTS (reference/Ticket Dashboard.dc.html),
// with roles lowercased to match the shared UserRole enum.
const SEED_USERS = [
  { name: 'Jordan Lee', email: 'jordan.lee@nimbus.io', department: 'Engineering Leadership', role: 'admin' as const },
  { name: 'Priya Nair', email: 'priya.nair@nimbus.io', department: 'Engineering', role: 'manager' as const },
  { name: 'Aisha Patel', email: 'aisha.patel@nimbus.io', department: 'Security', role: 'manager' as const },
  { name: 'Marcus Chen', email: 'marcus.chen@nimbus.io', department: 'Backend', role: 'developer' as const },
  { name: 'Elena Volkov', email: 'elena.volkov@nimbus.io', department: 'Backend', role: 'developer' as const },
  { name: 'Sam Okafor', email: 'sam.okafor@nimbus.io', department: 'Infrastructure', role: 'developer' as const },
  { name: 'Tom Whitfield', email: 'tom.whitfield@nimbus.io', department: 'Mobile', role: 'developer' as const },
  { name: 'Diego Ramirez', email: 'diego.ramirez@nimbus.io', department: 'SRE', role: 'developer' as const },
];

// The prototype's three projects (reference/Ticket Dashboard.dc.html). All three are seeded
// so multi-project scoping (R2) is actually exercisable rather than theoretical.
const SEED_PROJECTS = [
  { name: 'Nimbus Triage', keyPrefix: 'NIM', nextTicketSeq: 1 },
  { name: 'Atlas Billing', keyPrefix: 'ATL', nextTicketSeq: 1 },
  { name: 'Vega Mobile', keyPrefix: 'VEG', nextTicketSeq: 1 },
];

// Sprints per project — added in M6b so the board's Sprint filter (spec 04) has real options.
// Dates are fixed rather than relative so re-seeding is deterministic.
const SEED_SPRINTS = [
  { name: 'Sprint 24', startsOn: '2026-06-15', endsOn: '2026-06-26' },
  { name: 'Sprint 25', startsOn: '2026-06-29', endsOn: '2026-07-10' },
  { name: 'Sprint 26', startsOn: '2026-07-13', endsOn: '2026-07-24' },
];

async function seed() {
  const db = createDb();

  await db.insert(users).values(SEED_USERS).onConflictDoNothing({ target: users.email });

  await db.insert(projects).values(SEED_PROJECTS).onConflictDoNothing({ target: projects.keyPrefix });

  // Every project gets the same sprint names; idempotent because an existing (project, name)
  // pair is skipped rather than duplicated on a re-run.
  const allProjects = await db.select().from(projects);
  const existing = await db.select().from(sprints);
  const seen = new Set(existing.map((s) => `${s.projectId}:${s.name}`));
  const toInsert = allProjects.flatMap((project) =>
    SEED_SPRINTS.filter((s) => !seen.has(`${project.id}:${s.name}`)).map((s) => ({ ...s, projectId: project.id })),
  );
  if (toInsert.length > 0) {
    await db.insert(sprints).values(toInsert);
  }

  console.log(
    `Seeded ${SEED_USERS.length} users, ${SEED_PROJECTS.length} projects, ` +
      `${allProjects.length * SEED_SPRINTS.length} sprints (${toInsert.length} new).`,
  );
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
