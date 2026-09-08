import { ticketListQuerySchema, type TicketListQuery } from '@ticket-tracker/shared';

/**
 * R7 / spec 03: the filter state lives in the URL, so a filtered view is shareable and
 * survives a refresh — the prototype kept filters in transient React state and lost them.
 *
 * Parsing uses the **same schema the API validates with** (`ticketListQuerySchema` from
 * `packages/shared`), so the address bar and the server can't disagree about what a valid
 * filter is. A hand-typed junk param falls back to the defaults rather than 400ing the view.
 */
function parse(raw: Record<string, unknown>): TicketListQuery {
  const result = ticketListQuerySchema.safeParse(raw);
  return result.success ? result.data : ticketListQuerySchema.parse({});
}

/**
 * The route's `validateSearch`. It returns the **stripped** form, because TanStack Router
 * writes whatever this returns back into the address bar — returning the defaulted object
 * would put `?page=1&pageSize=25&sortBy=createdAt&sortDir=desc` on every pristine list.
 * Components call `withDefaults` to get the full query for the API.
 */
export function validateTicketSearch(raw: Record<string, unknown>): Partial<TicketListQuery> {
  return stripDefaults(parse(raw));
}

/**
 * Fills in the defaults the URL deliberately omits. Takes a loose record because its input is
 * whatever was in the address bar — strings, junk, or nothing — not a trusted typed object.
 */
export function withDefaults(search: Record<string, unknown>): TicketListQuery {
  return parse(search);
}

/**
 * Defaults are omitted from the URL so a pristine list reads `/tickets`, not
 * `/tickets?page=1&pageSize=25&sortBy=createdAt&sortDir=desc`.
 */
const DEFAULTS = ticketListQuerySchema.parse({});

export function stripDefaults(query: TicketListQuery): Partial<TicketListQuery> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== DEFAULTS[key as keyof TicketListQuery]) {
      out[key] = value;
    }
  }
  return out as Partial<TicketListQuery>;
}

/** Changing any filter returns to page 1 — page 4 of the old result set is meaningless. */
export function withFilter(
  current: TicketListQuery,
  patch: Partial<TicketListQuery>,
): Partial<TicketListQuery> {
  const resetsPaging = !('page' in patch);
  return stripDefaults({ ...current, ...patch, ...(resetsPaging ? { page: 1 } : {}) });
}
