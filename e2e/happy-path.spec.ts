import { expect, test } from '@playwright/test';
import { actAs, cleanup, columnOf, dragCardTo, useProject, waitForBoard, type Seed } from './fixtures';

/**
 * Spec 09's core happy path, in one flow because each step depends on the last:
 * create → see it in the list → drag it on the board → edit in detail → comment →
 * confirm a Developer cannot delete → delete as Manager.
 */
test.describe('ticket lifecycle', () => {
  let seed: Seed;
  const title = 'Checkout times out on retry';

  test.beforeAll(async () => {
    // Vega Mobile is seeded but empty, so the counts below are the spec's own doing.
    seed = await useProject('VEG');
  });
  test.afterAll(async () => {
    await cleanup(seed);
  });

  test('a manager can take a ticket from creation to deletion', async ({ page }) => {
    await page.goto(`/projects/${seed.projectId}/overview`);
    await actAs(page, 'Aisha Patel'); // manager

    await test.step('create a bug', async () => {
      await page.goto(`/projects/${seed.projectId}/create`);
      await page.locator('main button').filter({ hasText: /^Bug$/i }).click();
      await page.locator('main input').first().fill(title);
      await page.locator('main textarea').fill('Retry loop never terminates.');

      const epicSelect = page.locator('main select').filter({ hasText: 'E2E parent epic' }).first();
      await epicSelect.selectOption({ index: 1 });

      await page.locator('main button:has-text("Create ticket")').click();
      // Spec 06: submitting lands on the new ticket's detail view.
      await expect(page).toHaveURL(/\/tickets\/[0-9a-f-]{36}$/);
      await expect(page.locator('header')).toContainText(title);
    });

    await test.step('it appears in the list', async () => {
      await page.goto(`/projects/${seed.projectId}/tickets`);
      await expect(page.locator('tbody')).toContainText(title);
      await expect(page.locator('main')).toContainText('of 2 tickets');

      // Filtering is server-side and bound to the URL (R7/R8).
      await page.goto(`/projects/${seed.projectId}/tickets?type=bug`);
      await expect(page.locator('tbody tr')).toHaveCount(1);
      await expect(page.locator('tbody')).toContainText(title);
    });

    await test.step('drag it across the board', async () => {
      await page.goto(`/projects/${seed.projectId}/board`);
      await waitForBoard(page);
      expect(await columnOf(page, title)).toBe('Backlog');

      await dragCardTo(page, title, 'In Progress');
      await expect.poll(() => columnOf(page, title)).toBe('In Progress');

      // …and the move persisted, not just moved optimistically in the cache.
      await page.reload();
      await waitForBoard(page);
      await expect.poll(() => columnOf(page, title)).toBe('In Progress');
    });

    await test.step('edit it in detail', async () => {
      await page.goto(`/projects/${seed.projectId}/tickets`);
      await page.locator('tbody tr', { hasText: title }).click();

      const save = page.locator('main button').filter({ hasText: /Save changes|Saved/ }).first();
      // Spec 05: Save stays disabled until something actually changes.
      await expect(save).toBeDisabled();

      await page.locator('main aside select').first().selectOption('Blocked');
      await expect(save).toBeEnabled();
      await save.click();
      await expect(save).toHaveText(/Saved/);

      await page.reload();
      await expect(page.locator('main aside select').first()).toHaveValue('Blocked');
    });

    await test.step('comment as the acting user (R6)', async () => {
      await page.locator('main textarea').fill('Reproduced — raising priority.');
      await page.locator('main button:has-text("Comment")').click();
      await expect(page.locator('main')).toContainText('Reproduced — raising priority.');
      // The author is taken server-side from the acting user, never from the page.
      await expect(page.locator('main')).toContainText('Aisha Patel');
      await expect(page.locator('main')).toContainText('Activity (1)');
    });

    await test.step('a developer cannot delete', async () => {
      await actAs(page, 'Diego Ramirez');
      await expect(page.locator('main button:has-text("Delete ticket")')).toHaveCount(0);
    });

    await test.step('a manager can', async () => {
      await actAs(page, 'Aisha Patel');
      page.once('dialog', (d) => d.accept());
      await page.locator('main button:has-text("Delete ticket")').click();

      await expect(page).toHaveURL(/\/tickets$/);
      await expect(page.locator('main')).not.toContainText(title);
    });
  });
});
