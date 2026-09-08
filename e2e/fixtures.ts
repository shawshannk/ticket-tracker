import { expect, type Page } from '@playwright/test';

export const API = process.env.E2E_API_URL ?? 'http://localhost:3000';

export interface Seed {
  projectId: string;
  epicId: string;
  admin: string;
  manager: string;
  developer: string;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init);
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const post = (id: string, body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', 'X-Acting-User-Id': id },
  body: JSON.stringify(body),
});

async function users() {
  const all = await json<{ id: string; role: string }[]>('/users');
  const pick = (role: string) => all.find((u) => u.role === role)!.id;
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
  await clearTickets(project.id, people.admin);

  const epic = await json<{ id: string }>(
    `/projects/${project.id}/tickets`,
    post(people.admin, { type: 'epic', title: 'E2E parent epic' }),
  );
  return { projectId: project.id, epicId: epic.id, ...people };
}

/** Leaves the project itself in place; only the rows a spec created are removed. */
export async function clearTickets(projectId: string, admin: string) {
  const { items } = await json<{ items: { id: string; type: string }[] }>(
    `/projects/${projectId}/tickets?pageSize=100`,
  );
  // Children first — the API refuses to delete a ticket others still link to (M5b).
  for (const t of [...items].sort((a, b) => (a.type === 'epic' ? 1 : -1))) {
    await fetch(`${API}/tickets/${t.id}`, { method: 'DELETE', headers: { 'X-Acting-User-Id': admin } });
  }
}

export const cleanup = (seed: Seed) => clearTickets(seed.projectId, seed.admin);

export function createTicket(seed: Seed, body: Record<string, unknown>) {
  return json<{ id: string }>(`/projects/${seed.projectId}/tickets`, post(seed.admin, body));
}

/** Picks the acting user in the sidebar; every mutation is attributed to them. */
export async function actAs(page: Page, name: string) {
  await page.locator('nav button').last().click();
  await page.locator(`nav button:has-text("${name}")`).last().click();
  await expect(page.locator('nav').getByText(name)).toBeVisible();
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
