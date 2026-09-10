import { expect, test } from '@playwright/test';
import { asApi, cleanup, columnOf, createTicket, dragCardTo, signIn, useProject, waitForBoard, type Seed } from './fixtures';

/**
 * Spec 09 asks to prioritise **multi-project isolation** and **status-by-type validation** —
 * the two areas where a subtle bug is invisible on screen but corrupts data.
 */
test.describe('server-enforced rules', () => {
  let a: Seed;
  let b: Seed;

  test.beforeAll(async () => {
    // Two seeded, otherwise-empty projects: Vega Mobile and Atlas Billing.
    a = await useProject('VEG');
    b = await useProject('ATL');
    await createTicket(a, {
      type: 'story', title: 'Only in project A', description: '', labels: [],
      priority: 'high', env: 'staging', size: 'm', epicId: a.epicId,
    });
  });
  test.afterAll(async () => {
    await cleanup(a);
    await cleanup(b);
  });

  test.beforeEach(async ({ page }) => {
    // Every view is behind the auth guard now, so each test starts by signing in.
    await signIn(page, 'manager');
  });

  test('a ticket in project A never appears in project B (R2)', async ({ page }) => {
    await page.goto(`/projects/${a.projectId}/tickets`);
    await expect(page.locator('tbody')).toContainText('Only in project A');

    await page.goto(`/projects/${b.projectId}/tickets`);
    await expect(page.locator('tbody')).not.toContainText('Only in project A');
    // Even when a search would match it.
    await page.goto(`/projects/${b.projectId}/tickets?search=Only in project A`);
    await expect(page.locator('main')).toContainText('No tickets');

    await page.goto(`/projects/${b.projectId}/board`);
    await expect(page.locator('main')).not.toContainText('Only in project A');

    await page.goto(`/projects/${b.projectId}/overview`);
    // B holds only its own epic.
    await expect(page.locator('main')).toContainText('Open tickets');
    await expect(page.locator('main')).not.toContainText('Only in project A');
  });

  test('a story cannot be dropped into an epic-only column (spec 04)', async ({ page }) => {
    await page.goto(`/projects/${a.projectId}/board`);
    await waitForBoard(page);
    expect(await columnOf(page, 'Only in project A')).toBe('Backlog');

    // "Planned" belongs to epics; the column is disabled while a story is dragged.
    await dragCardTo(page, 'Only in project A', 'Planned');
    await page.waitForTimeout(500);
    expect(await columnOf(page, 'Only in project A')).toBe('Backlog');

    await page.reload();
    await waitForBoard(page);
    expect(await columnOf(page, 'Only in project A')).toBe('Backlog');
  });

  test('the API rejects an invalid status even when the UI is bypassed (R1)', async () => {
    const list = await (await asApi('admin', `/projects/${a.projectId}/tickets?type=story`)).json();
    const story = list.items[0];

    const res = await asApi('admin', `/tickets/${story.id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'Planned' }),
    });
    // The board preventing the drop is UX; this is the actual control.
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain('not a valid status');
  });

  test('a developer cannot create an epic, in the UI or at the API (R3)', async ({ page }) => {
    await signIn(page, 'developer');
    await page.goto(`/projects/${a.projectId}/create`);
    await expect(page.locator('main button').filter({ hasText: /^Epic$/ })).toHaveCount(0);

    const res = await asApi('developer', `/projects/${a.projectId}/tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'epic', title: 'Should be refused' }),
    });
    expect(res.status).toBe(403);
  });
});
