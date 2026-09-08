import { describe, expect, it } from 'vitest';
import { buildPayload, emptyForm, parseLabels, validate } from './buildPayload';

const EPIC_ID = '11111111-1111-4111-8111-111111111111';
const STORY_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

const filled = (over = {}) => ({ ...emptyForm(), title: 'A title', epicId: EPIC_ID, ...over });

describe('label parsing', () => {
  it('splits on commas, trims, and drops blanks and duplicates', () => {
    expect(parseLabels(' frontend , api ,, api , ')).toEqual(['frontend', 'api']);
    expect(parseLabels('')).toEqual([]);
  });
});

describe('payload shape by type (spec 06)', () => {
  it('an epic carries no story/bug fields at all', () => {
    const payload = buildPayload(filled({ type: 'epic' })) as Record<string, unknown>;
    expect(payload.type).toBe('epic');
    for (const absent of ['env', 'size', 'severity', 'epicId', 'storyId', 'sprintId', 'startDate']) {
      expect(payload).not.toHaveProperty(absent);
    }
  });

  it('a story carries the shared fields but no severity or story link', () => {
    const payload = buildPayload(filled({ type: 'story' })) as Record<string, unknown>;
    expect(payload).toMatchObject({ type: 'story', epicId: EPIC_ID, env: 'staging', size: 'm' });
    expect(payload).not.toHaveProperty('severity');
    expect(payload).not.toHaveProperty('storyId');
  });

  it('a bug adds severity and an optional story link', () => {
    const payload = buildPayload(filled({ type: 'bug', severity: '1', storyId: STORY_ID })) as Record<string, unknown>;
    expect(payload).toMatchObject({ type: 'bug', severity: '1', storyId: STORY_ID });
  });

  it('never sends a reporter — the server fills it from the acting user', () => {
    expect(buildPayload(filled({ type: 'bug' }))).not.toHaveProperty('reporter');
  });

  it('empty optional selects become null, not empty strings', () => {
    const payload = buildPayload(filled({ type: 'bug', assigneeId: '', sprintId: '', startDate: '', storyId: '' })) as Record<string, unknown>;
    expect(payload.assigneeId).toBeNull();
    expect(payload.sprintId).toBeNull();
    expect(payload.startDate).toBeNull();
    expect(payload.storyId).toBeNull();
  });

  it('keeps values that were set', () => {
    const payload = buildPayload(filled({ assigneeId: USER_ID, labels: 'api, security' })) as Record<string, unknown>;
    expect(payload.assigneeId).toBe(USER_ID);
    expect(payload.labels).toEqual(['api', 'security']);
  });
});

describe('validation against the shared schema', () => {
  it('accepts a complete form for each type', () => {
    expect(validate(filled({ type: 'epic' }))).toEqual({});
    expect(validate(filled({ type: 'story' }))).toEqual({});
    expect(validate(filled({ type: 'bug' }))).toEqual({});
  });

  it('requires a title', () => {
    expect(validate(filled({ title: '' }))).toHaveProperty('title');
    // Whitespace only is not a title either — buildPayload trims before validating.
    expect(validate(filled({ title: '   ' }))).toHaveProperty('title');
  });

  it('requires an epic on a story or bug, but not on an epic', () => {
    expect(validate(filled({ type: 'story', epicId: '' }))).toHaveProperty('epicId');
    expect(validate(filled({ type: 'bug', epicId: '' }))).toHaveProperty('epicId');
    expect(validate(filled({ type: 'epic', epicId: '' }))).toEqual({});
  });

  it('rejects a non-uuid epic id', () => {
    expect(validate(filled({ epicId: 'not-a-uuid' }))).toHaveProperty('epicId');
  });
});
