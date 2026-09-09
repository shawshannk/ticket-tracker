import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as reachable without authentication. Spec 10 §3.4 allows exactly four:
 * login, refresh, invite-accept, and the health check. Adding a fifth is a policy change,
 * not a convenience — R11 says every other route resolves to a real user.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
