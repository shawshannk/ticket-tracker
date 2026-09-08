import { BadRequestException } from '@nestjs/common';
import { BUG_STATUSES, EPIC_STATUSES, STORY_STATUSES, TICKET_TYPES, type TicketType } from '@ticket-tracker/shared';
import { describe, expect, it } from 'vitest';
import {
  assertEpicStoryConsistency,
  assertStoryLinkAllowed,
  assertValidStatus,
  defaultStatusFor,
  isValidStatusFor,
} from './ticket-rules';

const EPIC = '11111111-1111-4111-8111-111111111111';
const OTHER_EPIC = '22222222-2222-4222-8222-222222222222';
const STORY = '33333333-3333-4333-8333-333333333333';

// Restated from specs/00 rather than imported from STATUS_BY_TYPE, so an accidental edit to
// the shared constant fails here instead of quietly redefining what the API accepts.
const ALLOWED: Record<TicketType, readonly string[]> = {
  epic: ['Planned', 'In Progress', 'Done'],
  story: ['Backlog', 'In Progress', 'In Review', 'Blocked', 'On Hold', 'Done'],
  bug: ['Backlog', 'In Progress', 'In Review', 'Blocked', 'On Hold', 'Done'],
};

const ALL_STATUSES = [...new Set([...EPIC_STATUSES, ...STORY_STATUSES, ...BUG_STATUSES])];

describe('status by type', () => {
  for (const type of TICKET_TYPES) {
    it(`accepts exactly the ${type} statuses and rejects the rest`, () => {
      for (const status of ALL_STATUSES) {
        expect(isValidStatusFor(type, status)).toBe(ALLOWED[type].includes(status));
      }
    });

    it(`defaults a new ${type} to ${ALLOWED[type][0]}`, () => {
      expect(defaultStatusFor(type)).toBe(ALLOWED[type][0]);
      expect(isValidStatusFor(type, defaultStatusFor(type))).toBe(true);
    });
  }

  it('rejects an epic-only status on a bug (the spec 04 drag case)', () => {
    expect(() => assertValidStatus('bug', 'Planned')).toThrow(BadRequestException);
    expect(() => assertValidStatus('story', 'Planned')).toThrow(BadRequestException);
  });

  it('rejects a story-only status on an epic', () => {
    for (const status of ['Backlog', 'In Review', 'Blocked', 'On Hold']) {
      expect(() => assertValidStatus('epic', status)).toThrow(BadRequestException);
    }
  });

  it('rejects unknown, empty and wrongly-cased statuses', () => {
    expect(() => assertValidStatus('story', 'Shipped')).toThrow(BadRequestException);
    expect(() => assertValidStatus('story', '')).toThrow(BadRequestException);
    expect(() => assertValidStatus('story', 'backlog')).toThrow(BadRequestException);
  });

  it('accepts every valid status without throwing', () => {
    for (const type of TICKET_TYPES) {
      for (const status of ALLOWED[type]) {
        expect(() => assertValidStatus(type, status)).not.toThrow();
      }
    }
  });
});

describe('epic/story consistency (R5)', () => {
  it('accepts a story that sits under the same epic', () => {
    expect(() => assertEpicStoryConsistency(EPIC, STORY, EPIC)).not.toThrow();
  });

  it('rejects a story that sits under a different epic', () => {
    expect(() => assertEpicStoryConsistency(EPIC, STORY, OTHER_EPIC)).toThrow(BadRequestException);
  });

  it('rejects a story with no epic when the bug has one', () => {
    expect(() => assertEpicStoryConsistency(EPIC, STORY, null)).toThrow(BadRequestException);
  });

  it('is a no-op when either link is absent', () => {
    expect(() => assertEpicStoryConsistency(EPIC, null, null)).not.toThrow();
    expect(() => assertEpicStoryConsistency(null, STORY, OTHER_EPIC)).not.toThrow();
    expect(() => assertEpicStoryConsistency(undefined, undefined, undefined)).not.toThrow();
  });
});

describe('story links are bug-only', () => {
  it('rejects a story link on an epic or a story', () => {
    expect(() => assertStoryLinkAllowed('epic', STORY)).toThrow(BadRequestException);
    expect(() => assertStoryLinkAllowed('story', STORY)).toThrow(BadRequestException);
  });

  it('allows a story link on a bug, and no link on anything', () => {
    expect(() => assertStoryLinkAllowed('bug', STORY)).not.toThrow();
    for (const type of TICKET_TYPES) {
      expect(() => assertStoryLinkAllowed(type, null)).not.toThrow();
    }
  });
});
