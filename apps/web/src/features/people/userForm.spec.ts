import type { User } from '@ticket-tracker/shared';
import { describe, expect, it } from 'vitest';
import { changedFields, emptyUserForm, formFromUser, validate } from './userForm';

const user = (over: Partial<User> = {}): User => ({
  id: 'u1', name: 'Marcus Chen', email: 'marcus.chen@nimbus.io',
  department: 'Backend', role: 'developer', createdAt: '2026-07-29T00:00:00Z', ...over,
});

describe('user form validation', () => {
  it('accepts a complete new user', () => {
    expect(validate({ ...emptyUserForm(), name: 'Nina Reyes', email: 'nina@nimbus.io' }, 'create')).toEqual({});
  });

  it('requires a name and a valid email on create', () => {
    const errors = validate({ ...emptyUserForm(), name: '', email: 'not-an-email' }, 'create');
    expect(errors).toHaveProperty('name');
    expect(errors).toHaveProperty('email');
  });

  it('rejects a department or role outside the enums', () => {
    const errors = validate({ name: 'X', email: 'x@nimbus.io', department: 'Astrology', role: 'wizard' }, 'create');
    expect(errors).toHaveProperty('department');
    expect(errors).toHaveProperty('role');
  });

  it('update mode still rejects a malformed value it is given', () => {
    expect(validate({ ...formFromUser(user()), email: 'nope' }, 'update')).toHaveProperty('email');
  });
});

describe('user dirty tracking', () => {
  it('an untouched form is clean', () => {
    const u = user();
    expect(changedFields(formFromUser(u), u)).toEqual({});
  });

  it('sends only the changed fields', () => {
    const u = user();
    expect(changedFields({ ...formFromUser(u), role: 'manager' }, u)).toEqual({ role: 'manager' });
    expect(changedFields({ ...formFromUser(u), name: 'M. Chen', department: 'SRE' }, u)).toEqual({
      name: 'M. Chen', department: 'SRE',
    });
  });

  it('reverting an edit by hand makes it clean again', () => {
    const u = user();
    const edited = { ...formFromUser(u), name: 'Someone Else' };
    expect(changedFields(edited, u)).toEqual({ name: 'Someone Else' });
    expect(changedFields({ ...edited, name: u.name }, u)).toEqual({});
  });
});
