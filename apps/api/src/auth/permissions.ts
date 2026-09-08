/**
 * The role matrix now lives in `packages/shared` so the API and the web app read one source
 * (see spec 00; the frontend needs it to hide controls a role can't use). Re-exported here so
 * existing `../auth/permissions` imports keep working and guards stay easy to find.
 */
export { PERMISSIONS, can, type GuardedAction } from '@ticket-tracker/shared';
