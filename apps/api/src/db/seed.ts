import 'dotenv/config';
import * as argon2 from 'argon2';
import { createDb } from './index';
import { projectMembers, projects, sprints, users } from './schema';

/**
 * argon2id at the OWASP baseline (docs/auth-tech-spec.md §6.9). M16 lifts these into
 * `password.service.ts`; they live here for now because the seed needs a hash before that
 * service exists, and a seed nobody can log into is not a usable seed.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Every seeded user shares this password so a fresh checkout is immediately usable. It is
 * documented in the README and is development-only by construction: the seed refuses to run
 * against a non-local database (see `assertLocalDatabase`).
 */
const SEED_PASSWORD = 'DevPassw0rd!2026';

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

/**
 * The seed creates accounts with a known password. That is fine locally and unacceptable
 * anywhere else, so this is a guard rather than a comment: a non-local host must be opted into
 * explicitly with SEED_ALLOW_REMOTE=true.
 */
function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  const host = url.match(/@([^:/?]+)/)?.[1] ?? '';
  const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres', 'db'].includes(host);
  if (!isLocal && process.env.SEED_ALLOW_REMOTE !== 'true') {
    throw new Error(
      `Refusing to seed a non-local database (host "${host}"). The seed sets a known password ` +
        'on every user. Set SEED_ALLOW_REMOTE=true only if you are certain.',
    );
  }
}

async function seed() {
  assertLocalDatabase();
  const db = createDb();

  // Hashed once, not once per user — argon2id is deliberately expensive, and eight identical
  // hashes of the same password buy nothing.
  const passwordHash = await argon2.hash(SEED_PASSWORD, ARGON2_OPTIONS);
  const now = new Date();

  await db
    .insert(users)
    .values(
      SEED_USERS.map((u) => ({ ...u, status: 'active' as const, passwordHash, passwordChangedAt: now })),
    )
    // Upsert rather than skip: on a database that already holds v1 users, "do nothing" would
    // leave all eight `invited` with no password, i.e. unable to log in once M17 lands. Only
    // the credential columns are re-asserted — name, department and role stay as they are, so
    // a locally edited user is not clobbered by a re-seed.
    .onConflictDoUpdate({
      target: users.email,
      set: { status: 'active', passwordHash, passwordChangedAt: now },
    });

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

  // Every seeded user is a member of every seeded project, with their global role — the same
  // shape the M15 migration backfilled onto existing data, so a seeded and a migrated database
  // are indistinguishable from the guards' point of view (spec 10 §3.2).
  const allUsers = await db.select({ id: users.id, role: users.role }).from(users);
  const memberships = allProjects.flatMap((project) =>
    allUsers.map((user) => ({ projectId: project.id, userId: user.id, role: user.role })),
  );
  if (memberships.length > 0) {
    await db.insert(projectMembers).values(memberships).onConflictDoNothing();
  }

  console.log(
    `Seeded ${SEED_USERS.length} users, ${SEED_PROJECTS.length} projects, ` +
      `${allProjects.length * SEED_SPRINTS.length} sprints (${toInsert.length} new), ` +
      `${memberships.length} project memberships.\n` +
      `All users are active with password: ${SEED_PASSWORD}`,
  );
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
