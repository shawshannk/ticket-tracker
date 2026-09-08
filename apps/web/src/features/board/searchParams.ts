import { boardQuerySchema, type BoardQuery } from '@ticket-tracker/shared';

/**
 * Same split as the tickets list (M9): `validateSearch` returns the stripped form, because
 * TanStack Router writes its return value straight back into the address bar — returning a
 * defaulted object would litter the URL with params the user never chose.
 *
 * The board's schema has no defaults to strip today (both filters are optional), but keeping
 * the shape identical to M9's means the two views stay consistent if one gains a default.
 */
function parse(raw: Record<string, unknown>): BoardQuery {
  const result = boardQuerySchema.safeParse(raw);
  // A hand-edited or stale URL renders an unfiltered board rather than an error.
  return result.success ? result.data : {};
}

export function validateBoardSearch(raw: Record<string, unknown>): BoardQuery {
  return stripEmpty(parse(raw));
}

export function withDefaults(search: Record<string, unknown>): BoardQuery {
  return parse(search);
}

/** "All" is the absent value — it leaves the URL rather than being sent as a sentinel. */
function stripEmpty(query: BoardQuery): BoardQuery {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') out[key] = value;
  }
  return out as BoardQuery;
}

export function withFilter(current: BoardQuery, patch: Partial<BoardQuery>): BoardQuery {
  return stripEmpty({ ...current, ...patch });
}
