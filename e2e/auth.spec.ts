import { expect, test } from '@playwright/test';
import {
  asApi,
  deleteUserRows,
  inviteUser,
  PEOPLE,
  SEED_PASSWORD,
  signIn,
  signOut,
  useProject,
  type Seed,
} from './fixtures';

/**
 * M20's acceptance criteria, end to end. These are the ones that only exist in a browser: a
 * redirect that remembers where you were going, a reload that doesn't flash the login page, and
 * a project list that shows nothing when you belong to nothing.
 *
 * M21 added the rest: the invite hand-off end to end, logging out and the back button, a
 * non-member on a project URL, and the developer's missing controls — all against a stack with
 * `AUTH_DEV_IMPERSONATION` **off**, which is the configuration that ships.
 */
test.describe('authentication', () => {
  let seed: Seed;

  test.beforeAll(async () => {
    seed = await useProject('VEG');
  });

  test('an unauthenticated visit redirects to /login and comes back afterwards', async ({ page }) => {
    await page.context().clearCookies();

    const intended = `/projects/${seed.projectId}/board`;
    await page.goto(intended);

    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.locator('#email')).toBeVisible();

    await page.locator('#email').fill(PEOPLE.manager.email);
    await page.locator('#password').fill(SEED_PASSWORD);
    await page.locator('button[type="submit"]').click();

    // Back to the board that was asked for, not to the default landing project.
    await expect(page).toHaveURL(new RegExp(`${seed.projectId}/board`));
  });

  test('a reload does not flash the login page', async ({ page }) => {
    await signIn(page, 'manager');
    await page.goto(`/projects/${seed.projectId}/overview`);

    // Watch every URL the router settles on across a reload. Bootstrap's single refresh runs
    // before the guard decides anything, so `/login` must never be among them — if it is, the
    // guard is treating "still checking" as "signed out".
    const seenLogin: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame() && frame.url().includes('/login')) seenLogin.push(frame.url());
    });

    await page.reload();
    await expect(page.locator('main')).toContainText('Open tickets');
    expect(seenLogin).toEqual([]);
  });

  test('the account menu offers the session controls, and no acting-as switcher', async ({ page }) => {
    await signIn(page, 'manager');
    await page.goto(`/projects/${seed.projectId}/overview`);

    await page.locator('nav button[aria-haspopup="menu"]').click();
    const menu = page.locator('nav [role="menu"]');

    await expect(menu).toContainText('Change password');
    await expect(menu).toContainText('Active sessions');
    await expect(menu).toContainText('Log out');
    await expect(menu).toContainText('Log out everywhere');
    // v1's switcher is gone — you cannot become someone you did not authenticate as (R11).
    await expect(page.locator('nav')).not.toContainText('Acting as');

    await menu.getByText('Active sessions').click();
    await expect(page).toHaveURL(/\/account\/sessions/);
    await expect(page.locator('main')).toContainText('This device');
  });

  test('the project switcher lists only memberships, and says so when there are none', async ({ page }) => {
    // A seeded developer, temporarily removed from every project. Restored in `finally`, and
    // `pnpm --filter @ticket-tracker/api run db:seed` puts them back if this ever dies mid-test.
    const users = await (await asApi('admin', '/users')).json();
    const outsider = users.find((u: { email: string }) => u.email === PEOPLE.developer.email);
    const projects = await (await asApi('admin', '/projects')).json();

    try {
      for (const project of projects) {
        await asApi('admin', `/projects/${project.id}/members/${outsider.id}`, { method: 'DELETE' });
      }

      await signIn(page, 'developer');
      // No memberships means no project to land on, so `/` renders its own empty state.
      await expect(page.locator('body')).toContainText("You're not a member of any project");
    } finally {
      for (const project of projects) {
        await asApi('admin', `/projects/${project.id}/members`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ userId: outsider.id, role: 'developer' }),
        });
      }
    }

    // And with membership restored, the switcher shows exactly those projects again.
    await signIn(page, 'developer');
    await page.goto(`/projects/${seed.projectId}/overview`);
    await page.locator('nav button').first().click();
    for (const project of projects) {
      await expect(page.locator('nav')).toContainText(project.name);
    }
  });

  test('logging out returns to /login, and the back button does not restore the app', async ({ page }) => {
    await signIn(page, 'manager');
    await page.goto(`/projects/${seed.projectId}/overview`);
    await expect(page.locator('main')).toContainText('Open tickets');

    await signOut(page);
    await expect(page).toHaveURL(/\/login/);

    // The interesting half. The previous page is in the browser's history and may even come back
    // from the bfcache, so "we navigated away" is not the same as "they are signed out". The
    // access token died with the document and the refresh cookie is gone, so the guard must send
    // them straight back — never a frame of somebody's tickets.
    await page.goBack();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Open tickets');
  });

  test('a non-member opening a project URL is told it does not exist', async ({ page }) => {
    // The whole point of R12 answering 404 rather than 403: nothing on screen distinguishes a
    // project that is hidden from one that never existed.
    const users = await (await asApi('admin', '/users')).json();
    const outsider = users.find((u: { email: string }) => u.email === PEOPLE.developer.email);
    await asApi('admin', `/projects/${seed.projectId}/members/${outsider.id}`, { method: 'DELETE' });

    try {
      await signIn(page, 'developer');
      await page.goto(`/projects/${seed.projectId}/overview`);
      await expect(page.locator('body')).toContainText(/not found|couldn.t load/i);
      await expect(page.locator('body')).not.toContainText('Open tickets');
    } finally {
      await asApi('admin', `/projects/${seed.projectId}/members`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: outsider.id, role: 'developer' }),
      });
    }
  });

  test('an invited person sets a password and lands signed in', async ({ browser }) => {
    // Spec 10 §4.1: the link is returned once and stored only as a digest, so the admin passing
    // it on is the whole delivery mechanism. This is that hand-off, end to end.
    const invite = await inviteUser('Invited Person', seed.projectId);

    // A second browser context — the invitee is not the admin, and must not inherit their session.
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const path = new URL(invite.inviteUrl).pathname;
      await page.goto(path);

      await expect(page.locator('body')).toContainText(invite.email);

      const password = 'quiet-harbour-lantern-42';
      await page.locator('#new-password').fill(password);
      await page.locator('#confirm-password').fill(password);
      await page.locator('button[type="submit"]').click();

      // Accepting signs them in directly — no second trip through the login form.
      await expect(page).not.toHaveURL(/\/invite\//);
      await expect(page.locator('body')).toContainText('Invited Person');

      // And the link is spent: a second use must not work, for them or anyone else.
      await context.clearCookies();
      await page.goto(path);
      await expect(page.locator('body')).toContainText(/no longer valid/i);
    } finally {
      await context.close();
      await deleteUserRows(invite.userId);
    }
  });

  test('a developer sees neither the Epic option nor Delete on a ticket they did not report', async ({ page }) => {
    const ticket = await (
      await asApi('manager', `/projects/${seed.projectId}/tickets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'story', title: 'Reported by the manager', description: '', labels: [],
          priority: 'medium', env: 'staging', size: 'm', epicId: seed.epicId,
        }),
      })
    ).json();

    await signIn(page, 'developer');

    await page.goto(`/projects/${seed.projectId}/create`);
    await expect(page.locator('main button').filter({ hasText: /^Epic$/ })).toHaveCount(0);

    await page.goto(`/projects/${seed.projectId}/tickets/${ticket.id}`);
    await expect(page.locator('main')).toContainText('Reported by the manager');
    await expect(page.locator('main button:has-text("Delete ticket")')).toHaveCount(0);
  });

  test('the members table adds, re-roles and removes, and protects the last admin', async ({ page }) => {
    await signIn(page, 'admin');
    await page.goto(`/projects/${seed.projectId}/settings/members`);

    const rowFor = (name: string) => page.locator('main div.flex.items-center.gap-3', { hasText: name }).first();

    const directory = await (await asApi('admin', '/users')).json();
    const developerId = directory.find((u: { email: string }) => u.email === PEOPLE.developer.email).id;

    // The seed makes everyone a member, so start from a known state: remove, then re-add.
    await rowFor(PEOPLE.developer.name).locator('button:has-text("Remove")').click();
    await expect(rowFor(PEOPLE.developer.name)).toHaveCount(0);

    // By value, not label: the picker's option values are user ids, and Playwright's label
    // matching takes a literal string rather than a pattern.
    await page.locator('main select').first().selectOption(developerId);
    await page.locator('main button:has-text("Add member")').click();
    await expect(rowFor(PEOPLE.developer.name)).toBeVisible();

    // Re-role, and confirm it stuck server-side rather than only in the select.
    await rowFor(PEOPLE.developer.name).locator('select').selectOption('manager');
    await expect
      .poll(async () => {
        const members = await (await asApi('admin', `/projects/${seed.projectId}/members`)).json();
        return members.find((m: { name: string }) => m.name === PEOPLE.developer.name)?.role;
      })
      .toBe('manager');

    await rowFor(PEOPLE.developer.name).locator('select').selectOption('developer');

    // R18: the sole project admin's Remove is disabled rather than merely failing on click.
    const members = await (await asApi('admin', `/projects/${seed.projectId}/members`)).json();
    const admins = members.filter((m: { role: string }) => m.role === 'admin');
    if (admins.length === 1) {
      await expect(rowFor(admins[0].name).locator('button:has-text("Remove")')).toBeDisabled();
    }
  });

  test('the app runs without tripping its own Content-Security-Policy', async ({ page, baseURL }) => {
    // Spec 10 §8 names a strict CSP as *the* mitigation for what XSS could do with the in-memory
    // access token, so "the app still works under it" is a requirement, not a formality.
    //
    // Only the built image serves the header — nginx adds it, the Vite dev server does not — so
    // against a dev server this asserts nothing and says so rather than pretending. Run it against
    // the image with `E2E_BASE_URL=http://127.0.0.1:5173` (Compose publishes the container there;
    // `localhost` may resolve to a local dev server first).
    const violations: string[] = [];
    page.on('console', (m) => {
      if (/content security policy/i.test(m.text())) violations.push(m.text());
    });

    const response = await page.goto('/login');
    const csp = response?.headers()['content-security-policy'];

    if (!csp) {
      test.info().annotations.push({
        type: 'note',
        description: `No CSP header from ${baseURL} — this is a dev server, so the policy is unverified here.`,
      });
    } else {
      const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'));
      expect(scriptSrc).toBe("script-src 'self'");
      // Asserted on the directive, not the whole header: `style-src` does carry 'unsafe-inline',
      // because the app sets inline `style` attributes (role colours). Spec 10 §8 asks for no
      // inline *scripts*, which is what this pins.
      expect(scriptSrc).not.toContain('unsafe-eval');
      expect(csp).toMatch(/connect-src [^;]*http/);
    }

    await signIn(page, 'manager');
    await page.goto(`/projects/${seed.projectId}/board`);
    await expect(page.locator('nav')).toContainText(PEOPLE.manager.name);

    expect(violations).toEqual([]);
  });
});
