import { expect, type Page } from '@playwright/test';
import type { UserRole } from '@ticket-tracker/shared';

export const API = process.env.E2E_API_URL ?? 'http://localhost:3000';

/**
 * The seed's shared dev password (apps/api/src/db/seed.ts). Every seeded account uses it, so a
 * spec only has to name the person it wants to be.
 */
export const SEED_PASSWORD = 'DevPassw0rd!2026';

/** The seeded people these specs sign in as, by the role each one exercises. */
export const PEOPLE = {
  admin: { name: 'Jordan Lee', email: 'jordan.lee@nimbus.io' },
  manager: { name: 'Aisha Patel', email: 'aisha.patel@nimbus.io' },
  developer: { name: 'Diego Ramirez', email: 'diego.ramirez@nimbus.io' },
} as const;

export type Person = keyof typeof PEOPLE;

export interface Seed {
  projectId: string;
  epicId: string;
  admin: string;
  manager: string;
  developer: string;
}

/**
 * M20 turned the API's identity from a header anyone could set into a token you have to earn, so
 * the fixtures log in for real like any other client. `X-Acting-User-Id` appears nowhere here.
 */
const tokens = new Map<string, string>();

export async function tokenFor(person: Person): Promise<string> {
  const cached = tokens.get(person);
  if (cached) return cached;

  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: PEOPLE[person].email, password: SEED_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(
      `Could not sign in as ${PEOPLE[person].email} (${res.status}). ` +
        'Run `pnpm --filter @ticket-tracker/api run db:seed` — the seed sets the dev password.',
    );
  }
  const { accessToken } = (await res.json()) as { accessToken: string };
  tokens.set(person, accessToken);
  return accessToken;
}

async function json<T>(path: string, init: RequestInit = {}, person: Person = 'admin'): Promise<T> {
  // Reads are guarded now too (R11), so every fixture call carries a token — not just writes.
  const token = await tokenFor(person);
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const post = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

async function users() {
  const all = await json<{ id: string; email: string }[]>('/users');
  const pick = (person: Person) => all.find((u) => u.email === PEOPLE[person].email)!.id;
  return { admin: pick('admin'), manager: pick('manager'), developer: pick('developer') };
}

/**
 * Specs run inside the **seeded** projects rather than creating their own.
 *
 * There is no `DELETE /projects` endpoint (M4 never needed one), so creating a project per run
 * would leave a growing pile behind and eventually collide on `key_prefix`. Working inside a
 * known-empty seeded project is repeatable, and `db:seed` is idempotent.
 */
export async function useProject(keyPrefix: string): Promise<Seed> {
  const projects = await json<{ id: string; keyPrefix: string }[]>('/projects');
  const project = projects.find((p) => p.keyPrefix === keyPrefix);
  if (!project) throw new Error(`Seeded project ${keyPrefix} not found — run pnpm --filter @ticket-tracker/api run db:seed`);

  const people = await users();
  await ensureMembership(project.id);
  await clearTickets(project.id);

  const epic = await json<{ id: string }>(
    `/projects/${project.id}/tickets`,
    post({ type: 'epic', title: 'E2E parent epic' }),
  );
  return { projectId: project.id, epicId: epic.id, ...people };
}

/**
 * Put the three test people back in the project with their global role as their project role,
 * exactly as `db:seed` leaves things.
 *
 * Several specs deliberately remove someone to test scoping and restore them in `finally`. That
 * is not enough: a run killed mid-test, or a failure in the restore itself, leaves the seed
 * altered — and the symptom is some *other* spec failing later for a reason that has nothing to
 * do with it. Repairing here makes every run start from the same place regardless of how the
 * last one ended.
 */
async function ensureMembership(projectId: string) {
  const directory = await json<{ id: string; email: string; role: UserRole }[]>('/users');
  const members = await json<{ userId: string; role: string }[]>(`/projects/${projectId}/members`);
  const byId = new Map(members.map((m) => [m.userId, m.role]));

  for (const person of Object.keys(PEOPLE) as Person[]) {
    const row = directory.find((u) => u.email === PEOPLE[person].email);
    if (!row) continue;

    const current = byId.get(row.id);
    if (current === undefined) {
      await json<void>(`/projects/${projectId}/members`, post({ userId: row.id, role: row.role }));
    } else if (current !== row.role) {
      await json<void>(`/projects/${projectId}/members/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: row.role }),
      });
    }
  }
}

/** Leaves the project itself in place; only the rows a spec created are removed. */
export async function clearTickets(projectId: string) {
  const { items } = await json<{ items: { id: string; type: string }[] }>(
    `/projects/${projectId}/tickets?pageSize=100`,
  );
  // Children first — the API refuses to delete a ticket others still link to (M5b).
  for (const t of [...items].sort((a, b) => (a.type === 'epic' ? 1 : -1))) {
    await json<void>(`/tickets/${t.id}`, { method: 'DELETE' });
  }
}

export const cleanup = (seed: Seed) => clearTickets(seed.projectId);

export function createTicket(seed: Seed, body: Record<string, unknown>) {
  return json<{ id: string }>(`/projects/${seed.projectId}/tickets`, post(body));
}

/** A raw request as a given person, for the specs that bypass the UI to test the API directly. */
export async function asApi(person: Person, path: string, init: RequestInit = {}) {
  const token = await tokenFor(person);
  return fetch(`${API}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` },
  });
}

/**
 * Sign in through the real login form (spec 10 §6). Replaces v1's `actAs`, which picked a name
 * from a dropdown — there is nothing to pick from any more, which is the point of M20.
 *
 * Ends any current session first, so a spec can switch people mid-flow the way it used to.
 * Clearing cookies rather than driving the account menu is deliberate: `/login` redirects away
 * as soon as bootstrap finds a live session, so *reading the URL* to decide whether to log out
 * races that redirect and fails intermittently. The access token needs no clearing — it lives in
 * a module variable and dies with the page. (Logging out through the UI is M21's own test.)
 */
export async function signIn(page: Page, person: Person) {
  await page.context().clearCookies();
  await page.goto('/login');

  await page.locator('#email').fill(PEOPLE[person].email);
  await page.locator('#password').fill(SEED_PASSWORD);
  await page.locator('button[type="submit"]').click();

  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  // Not `nav` — a person with no project memberships lands on an empty state that has no
  // sidebar at all, and this helper has to work for them too.
  await expect(page.locator('#email')).toHaveCount(0);
}

/** Log out through the account menu, the way a person does. */
export async function signOut(page: Page, everywhere = false) {
  await page.locator('nav button[aria-haspopup="menu"]').click();
  const label = everywhere ? 'Log out everywhere' : 'Log out';
  await page.locator('nav [role="menu"] button').filter({ hasText: new RegExp(`^${label}$`) }).click();
  await page.waitForURL(/\/login/);
}

/** Creates a user through the API and returns the raw invite link, shown exactly once. */
export async function inviteUser(
  name: string,
  /** Grant membership too, so accepting lands them in a project rather than an empty state. */
  projectId?: string,
): Promise<{ userId: string; email: string; inviteUrl: string }> {
  const email = `invitee-${Date.now()}-${Math.floor(Math.random() * 1000)}@nimbus.io`;
  const created = await json<{ user: { id: string }; inviteUrl: string }>(
    '/users',
    post({ name, email, department: 'Engineering', role: 'developer' }),
  );
  if (projectId) {
    await json<void>(`/projects/${projectId}/members`, post({ userId: created.user.id, role: 'developer' }));
  }
  return { userId: created.user.id, email, inviteUrl: created.inviteUrl };
}

export async function deleteUserRows(userId: string) {
  // No DELETE /users endpoint (spec 07 never needed one); disabling is how an account is retired.
  await json<void>(`/users/${userId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'disabled' }),
  });
}

export const boardColumns = (page: Page) => page.locator('main div.rounded-xl.p-3');

/** Which board column currently holds a card, or null if it isn't on the board. */
export async function columnOf(page: Page, cardTitle: string): Promise<string | null> {
  const columns = boardColumns(page);
  const count = await columns.count();
  for (let i = 0; i < count; i++) {
    const text = await columns.nth(i).innerText();
    if (text.includes(cardTitle)) return text.split('\n')[0];
  }
  return null;
}

/** Waits for the board to have rendered its columns before asserting on them. */
export async function waitForBoard(page: Page) {
  await expect(boardColumns(page).first()).toBeVisible();
}

/** dnd-kit needs real pointer movement; a synthetic drop event does nothing. */
export async function dragCardTo(page: Page, cardTitle: string, columnName: string) {
  const card = page.locator('main').getByText(cardTitle, { exact: false }).first().locator('..');
  const columns = boardColumns(page);
  let target = null;
  const count = await columns.count();
  for (let i = 0; i < count; i++) {
    if ((await columns.nth(i).innerText()).startsWith(columnName)) target = columns.nth(i);
  }
  if (!target) throw new Error(`No board column named ${columnName}`);

  const from = (await card.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 15 });
  await page.mouse.up();
}
