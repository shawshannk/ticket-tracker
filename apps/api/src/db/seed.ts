import 'dotenv/config';
import { createDb } from './index';
import { projects, users } from './schema';

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

async function seed() {
  const db = createDb();

  await db.insert(users).values(SEED_USERS).onConflictDoNothing({ target: users.email });

  await db
    .insert(projects)
    .values({ name: 'Nimbus Triage', keyPrefix: 'NIM', nextTicketSeq: 1 })
    .onConflictDoNothing({ target: projects.keyPrefix });

  console.log(`Seeded ${SEED_USERS.length} users and 1 project.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
