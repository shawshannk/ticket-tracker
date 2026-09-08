import { z } from 'zod';
import {
  DEPARTMENTS,
  TICKET_ENVS,
  TICKET_PRIORITIES,
  TICKET_SEVERITIES,
  TICKET_SIZES,
  TICKET_TYPES,
  USER_ROLES,
} from './enums';

export const userRoleSchema = z.enum(USER_ROLES);
export const departmentSchema = z.enum(DEPARTMENTS);
export const ticketTypeSchema = z.enum(TICKET_TYPES);
export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES);
export const ticketSeveritySchema = z.enum(TICKET_SEVERITIES);
export const ticketEnvSchema = z.enum(TICKET_ENVS);
export const ticketSizeSchema = z.enum(TICKET_SIZES);

// --- Users ---

export const userCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  department: departmentSchema,
  role: userRoleSchema,
});

export const userUpdateSchema = userCreateSchema.partial();

// --- Projects ---

export const projectCreateSchema = z.object({
  name: z.string().min(1),
  keyPrefix: z
    .string()
    .min(2)
    .max(6)
    .regex(/^[A-Z]+$/, 'keyPrefix must be uppercase letters only, e.g. "NIM"'),
});

// --- Tickets ---
// Mirrors the branching shape from specs/06-create-ticket.md: fields present on a create
// payload depend on `type`, enforced with a discriminated union rather than one loose object.

const baseTicketSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  assigneeId: z.string().uuid().nullable().optional(),
  labels: z.array(z.string()).default([]),
});

const storyOrBugFields = z.object({
  priority: ticketPrioritySchema.default('medium'),
  env: ticketEnvSchema,
  size: ticketSizeSchema,
  startDate: z.string().nullable().optional(),
  estimatedEndDate: z.string().nullable().optional(),
  sprintId: z.string().uuid().nullable().optional(),
  epicId: z.string().uuid(),
});

const bugOnlyFields = z.object({
  severity: ticketSeveritySchema,
  storyId: z.string().uuid().nullable().optional(),
});

export const epicCreateSchema = baseTicketSchema.extend({
  type: z.literal('epic'),
  priority: ticketPrioritySchema.default('medium'),
});

export const storyCreateSchema = baseTicketSchema.extend({ type: z.literal('story') }).merge(storyOrBugFields);

export const bugCreateSchema = baseTicketSchema
  .extend({ type: z.literal('bug') })
  .merge(storyOrBugFields)
  .merge(bugOnlyFields);

export const ticketCreateSchema = z.discriminatedUnion('type', [
  epicCreateSchema,
  storyCreateSchema,
  bugCreateSchema,
]);

// PATCH /tickets/:id — partial update; a ticket's `type` cannot change after creation, and
// status-by-type / epic-story consistency are validated server-side against stored data
// (see specs/00 and specs/05), not at the schema layer.
export const ticketUpdateSchema = z.object({
  status: z.string().min(1).optional(),
  priority: ticketPrioritySchema.optional(),
  severity: ticketSeveritySchema.nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  env: ticketEnvSchema.nullable().optional(),
  size: ticketSizeSchema.nullable().optional(),
  startDate: z.string().nullable().optional(),
  estimatedEndDate: z.string().nullable().optional(),
  sprintId: z.string().uuid().nullable().optional(),
  epicId: z.string().uuid().nullable().optional(),
  storyId: z.string().uuid().nullable().optional(),
});

export const moveTicketStatusSchema = z.object({
  status: z.string().min(1),
});

// --- Comments ---

export const commentCreateSchema = z.object({
  body: z.string().min(1),
});

// --- Ticket list query (GET /projects/:projectId/tickets) ---
// Lives in shared so the frontend's URL-search-param validation (R7) is the same schema the
// API enforces. `coerce` because query-string values arrive as strings.

export const TICKET_SORT_FIELDS = ['createdAt', 'updatedAt', 'key', 'title', 'status', 'priority'] as const;
export type TicketSortField = (typeof TICKET_SORT_FIELDS)[number];

export const ticketListQuerySchema = z.object({
  status: z.string().min(1).optional(),
  priority: ticketPrioritySchema.optional(),
  assignee: z.string().uuid().optional(),
  env: ticketEnvSchema.optional(),
  epic: z.string().uuid().optional(),
  type: ticketTypeSchema.optional(),
  // A blank search box means "no filter", not an error.
  search: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(TICKET_SORT_FIELDS).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
