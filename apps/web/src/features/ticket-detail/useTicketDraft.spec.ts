import type { TicketDetail } from '@ticket-tracker/shared';
import { describe, expect, it } from 'vitest';
import { changedFields, draftFrom } from './useTicketDraft';

const ticket = (over: Partial<TicketDetail> = {}): TicketDetail => ({
  id: 't1', projectId: 'p1', key: 'NIM-3', type: 'bug', title: 'Token leak',
  description: 'd', status: 'In Progress', priority: 'high', severity: '1',
  assigneeId: 'u1', reporter: 'Marcus Chen', labels: ['security'], env: 'production',
  size: 'm', epicId: 'e1', storyId: 's1', sprintId: null, startDate: null,
  estimatedEndDate: null, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z',
  assignee: { id: 'u1', name: 'Marcus Chen' }, epic: null, story: null, comments: [],
  statusOptions: ['Backlog', 'In Progress', 'Done'], storyOptions: [], ...over,
});

describe('ticket draft / dirty tracking (spec 05)', () => {
  it('an untouched draft is clean, so Save stays disabled', () => {
    const t = ticket();
    expect(changedFields(draftFrom(t), t)).toEqual({});
  });

  it('sends only the fields that changed, never the whole ticket', () => {
    const t = ticket();
    const draft = { ...draftFrom(t), status: 'Done', priority: 'low' as const };
    expect(changedFields(draft, t)).toEqual({ status: 'Done', priority: 'low' });
  });

  it('treats null and undefined as the same absence', () => {
    // An unset date is null from the API; a cleared date input gives '' → null.
    const t = ticket({ startDate: null });
    expect(changedFields({ ...draftFrom(t), startDate: undefined }, t)).toEqual({});
  });

  it('detects clearing a value to null', () => {
    const t = ticket({ assigneeId: 'u1' });
    expect(changedFields({ ...draftFrom(t), assigneeId: null }, t)).toEqual({ assigneeId: null });
  });

  it('detects setting a previously empty field', () => {
    const t = ticket({ sprintId: null });
    expect(changedFields({ ...draftFrom(t), sprintId: 'sp1' }, t)).toEqual({ sprintId: 'sp1' });
  });

  it('carries only the editable fields — title, type and reporter are not editable here', () => {
    const draft = draftFrom(ticket());
    expect(Object.keys(draft).sort()).toEqual([
      'assigneeId', 'env', 'epicId', 'estimatedEndDate', 'priority', 'size', 'sprintId', 'startDate', 'status', 'storyId',
    ]);
  });

  it('re-seeding from the saved ticket clears the dirty state', () => {
    const before = ticket();
    const draft = { ...draftFrom(before), status: 'Done' };
    expect(changedFields(draft, before)).toEqual({ status: 'Done' });
    const after = ticket({ status: 'Done', updatedAt: '2026-09-03T00:00:00Z' });
    expect(changedFields(draftFrom(after), after)).toEqual({});
  });
});
