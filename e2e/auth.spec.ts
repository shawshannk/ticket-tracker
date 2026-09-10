import { expect, test } from '@playwright/test';
import { asApi, PEOPLE, SEED_PASSWORD, signIn, useProject, type Seed } from './fixtures';

/**
 * M20's acceptance criteria, end to end. These are the ones that only exist in a browser: a
 * redirect that remembers where you were going, a reload that doesn't flash the login page, and
 * a project list that shows nothing when you belong to nothing.
 *
 * (M21 adds the rest of the auth suite: the invite hand-off, CSP, and the back button after
 * logging out.)
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
});
