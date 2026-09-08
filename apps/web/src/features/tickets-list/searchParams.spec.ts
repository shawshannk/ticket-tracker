import { describe, expect, it } from 'vitest';
import { stripDefaults, validateTicketSearch, withDefaults, withFilter } from './searchParams';

describe('ticket list URL search params', () => {
  it('applies the shared schema defaults to a bare URL', () => {
    expect(withDefaults({})).toMatchObject({ page: 1, pageSize: 25, sortBy: 'createdAt', sortDir: 'desc' });
  });

  it('coerces numeric params arriving as strings', () => {
    expect(withDefaults({ page: '3', pageSize: '10' })).toMatchObject({ page: 3, pageSize: 10 });
  });

  it('falls back to defaults rather than throwing on a hand-mangled URL', () => {
    // A view must still render if someone edits the address bar or follows a stale link.
    expect(withDefaults({ sortBy: 'reporter', pageSize: 9999 })).toMatchObject({ sortBy: 'createdAt', pageSize: 25 });
    expect(withDefaults({ priority: 'urgent' })).toMatchObject({ page: 1 });
  });

  it('keeps real filters', () => {
    expect(withDefaults({ status: 'In Review', type: 'bug', search: 'token' })).toMatchObject({
      status: 'In Review', type: 'bug', search: 'token',
    });
  });

  it('omits defaults from the URL so a pristine list has a clean link', () => {
    expect(stripDefaults(withDefaults({}))).toEqual({});
    expect(stripDefaults(withDefaults({ status: 'Done', page: '2' }))).toEqual({ status: 'Done', page: 2 });
  });

  it('validateSearch keeps the address bar free of default params', () => {
    expect(validateTicketSearch({})).toEqual({});
    expect(validateTicketSearch({ type: 'bug', page: '1' })).toEqual({ type: 'bug' });
    expect(validateTicketSearch({ type: 'bug', page: '2' })).toEqual({ type: 'bug', page: 2 });
  });

  it('resets to page 1 when a filter changes', () => {
    const current = withDefaults({ page: '4', status: 'Done' });
    expect(withFilter(current, { status: 'Blocked' })).toEqual({ status: 'Blocked' });
  });

  it('does not reset the page when the page itself changes', () => {
    const current = withDefaults({ status: 'Done' });
    expect(withFilter(current, { page: 3 })).toEqual({ status: 'Done', page: 3 });
  });

  it('clearing a filter to undefined removes it from the URL', () => {
    const current = withDefaults({ status: 'Done', type: 'bug' });
    expect(withFilter(current, { status: undefined })).toEqual({ type: 'bug' });
  });
});
