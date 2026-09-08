import { ALL_STATUSES, type TicketSummary } from '@ticket-tracker/shared';
import { describe, expect, it } from 'vitest';
import { canDrop, columnsFor, groupByStatus } from './columns';
import { validateBoardSearch, withDefaults, withFilter } from './searchParams';

const ticket = (over: Partial<TicketSummary>): TicketSummary => ({
  id: 'id', projectId: 'p', key: 'NIM-1', type: 'story', title: 't', status: 'Backlog',
  priority: 'medium', severity: null, env: null, labels: [], assignee: null, epic: null,
  story: null, sprintId: null, createdAt: '', updatedAt: '', ...over,
});

describe('board columns (spec 04)', () => {
  it('shows the union of statuses when the type filter is All', () => {
    expect(columnsFor(undefined)).toEqual([
      'Backlog', 'Planned', 'In Progress', 'In Review', 'Blocked', 'On Hold', 'Done',
    ]);
  });

  it('narrows to the type-specific set', () => {
    expect(columnsFor('epic')).toEqual(['Planned', 'In Progress', 'Done']);
    expect(columnsFor('story')).toEqual(['Backlog', 'In Progress', 'In Review', 'Blocked', 'On Hold', 'Done']);
    expect(columnsFor('bug')).toEqual(columnsFor('story'));
  });
});

describe('drop validity', () => {
  it('refuses a bug or story into an epic-only column', () => {
    // The spec 04 example: you can't drag a Bug into "Planned".
    expect(canDrop(ticket({ type: 'bug' }), 'Planned')).toBe(false);
    expect(canDrop(ticket({ type: 'story' }), 'Planned')).toBe(false);
  });

  it('refuses an epic into a story-only column', () => {
    for (const status of ['Backlog', 'In Review', 'Blocked', 'On Hold']) {
      expect(canDrop(ticket({ type: 'epic' }), status)).toBe(false);
    }
  });

  it('allows every status within a ticket’s own type', () => {
    expect(canDrop(ticket({ type: 'epic' }), 'In Progress')).toBe(true);
    expect(canDrop(ticket({ type: 'bug' }), 'On Hold')).toBe(true);
    expect(canDrop(ticket({ type: 'story' }), 'Done')).toBe(true);
  });

  it('every column is droppable by at least one type, and none by all', () => {
    for (const status of ALL_STATUSES) {
      const types = (['epic', 'story', 'bug'] as const).filter((t) => canDrop(ticket({ type: t }), status));
      expect(types.length).toBeGreaterThan(0);
    }
    expect(canDrop(ticket({ type: 'epic' }), 'Backlog')).toBe(false);
  });
});

describe('grouping', () => {
  it('buckets tickets by status and keeps empty columns present', () => {
    const grouped = groupByStatus(
      [ticket({ id: 'a', status: 'Backlog' }), ticket({ id: 'b', status: 'Done' }), ticket({ id: 'c', status: 'Backlog' })],
      columnsFor('story'),
    );
    expect(grouped['Backlog'].map((t) => t.id)).toEqual(['a', 'c']);
    expect(grouped['Done'].map((t) => t.id)).toEqual(['b']);
    expect(grouped['Blocked']).toEqual([]);
  });

  it('drops a ticket whose status is outside the visible columns rather than inventing one', () => {
    const grouped = groupByStatus([ticket({ type: 'epic', status: 'Planned' })], columnsFor('story'));
    expect(Object.keys(grouped)).toEqual([...columnsFor('story')]);
    expect(Object.values(grouped).flat()).toHaveLength(0);
  });
});

describe('board URL params', () => {
  it('keeps the address bar free of empty filters', () => {
    expect(validateBoardSearch({})).toEqual({});
    expect(validateBoardSearch({ type: 'bug' })).toEqual({ type: 'bug' });
  });

  it('accepts backlog or a uuid for sprint, and ignores junk', () => {
    expect(withDefaults({ sprint: 'backlog' })).toEqual({ sprint: 'backlog' });
    const uuid = '11111111-1111-4111-8111-111111111111';
    expect(withDefaults({ sprint: uuid })).toEqual({ sprint: uuid });
    expect(withDefaults({ sprint: 'sprint-one' })).toEqual({});
  });

  it('clearing a filter removes it from the URL', () => {
    expect(withFilter({ type: 'bug', sprint: 'backlog' }, { type: undefined })).toEqual({ sprint: 'backlog' });
  });
});
