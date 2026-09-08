import { describe, expect, it } from 'vitest';
import { relativeTime } from './relativeTime';

describe('relativeTime', () => {
  const now = new Date('2026-09-08T12:00:00Z').getTime();
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('describes recent timestamps in the largest sensible unit', () => {
    expect(relativeTime(ago(30 * 1000), now)).toBe('just now');
    expect(relativeTime(ago(5 * 60 * 1000), now)).toMatch(/5 minutes ago/);
    expect(relativeTime(ago(3 * 60 * 60 * 1000), now)).toMatch(/3 hours ago/);
    expect(relativeTime(ago(2 * 24 * 60 * 60 * 1000), now)).toMatch(/2 days ago/);
    expect(relativeTime(ago(60 * 24 * 60 * 60 * 1000), now)).toMatch(/2 months ago/);
  });

  it('handles a future timestamp without producing "-1 days ago"', () => {
    expect(relativeTime(new Date(now + 2 * 60 * 60 * 1000).toISOString(), now)).toMatch(/in 2 hours/);
  });
});
