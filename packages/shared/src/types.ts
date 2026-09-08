import { z } from 'zod';
import type { Department, TicketEnv, TicketPriority, TicketSeverity, TicketSize, TicketType, UserRole } from './enums';
import {
  bugCreateSchema,
  commentCreateSchema,
  epicCreateSchema,
  moveTicketStatusSchema,
  projectCreateSchema,
  storyCreateSchema,
  boardQuerySchema,
  ticketCreateSchema,
  ticketListQuerySchema,
  ticketUpdateSchema,
  userCreateSchema,
  userUpdateSchema,
} from './schemas';

// --- Entities (mirror apps/api/src/db/schema) ---

export interface Project {
  id: string;
  name: string;
  keyPrefix: string;
  nextTicketSeq: number;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  department: Department;
  role: UserRole;
  createdAt: string;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
}

export interface Ticket {
  id: string;
  projectId: string;
  key: string;
  type: TicketType;
  title: string;
  description: string;
  status: string;
  priority: TicketPriority;
  severity: TicketSeverity | null;
  assigneeId: string | null;
  reporter: string;
  labels: string[];
  env: TicketEnv | null;
  size: TicketSize | null;
  epicId: string | null;
  storyId: string | null;
  sprintId: string | null;
  startDate: string | null;
  estimatedEndDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

// --- DTOs inferred from the Zod schemas ---

export type UserCreateDto = z.infer<typeof userCreateSchema>;
export type UserUpdateDto = z.infer<typeof userUpdateSchema>;
export type ProjectCreateDto = z.infer<typeof projectCreateSchema>;
export type EpicCreateDto = z.infer<typeof epicCreateSchema>;
export type StoryCreateDto = z.infer<typeof storyCreateSchema>;
export type BugCreateDto = z.infer<typeof bugCreateSchema>;
export type TicketCreateDto = z.infer<typeof ticketCreateSchema>;
export type TicketUpdateDto = z.infer<typeof ticketUpdateSchema>;
export type MoveTicketStatusDto = z.infer<typeof moveTicketStatusSchema>;
export type CommentCreateDto = z.infer<typeof commentCreateSchema>;
export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;
export type BoardQuery = z.infer<typeof boardQuerySchema>;
/** The raw, pre-default form — what a URL search-param parser starts from. */
export type TicketListQueryInput = z.input<typeof ticketListQuerySchema>;

// --- Read models (spec 00 "DTO/summary shapes") ---

export interface UserRef {
  id: string;
  name: string;
}

export interface TicketRef {
  id: string;
  key: string;
  title: string;
}

/** One row of the list / board / recent-activity views: the ticket plus the names it shows. */
export interface TicketSummary {
  id: string;
  projectId: string;
  key: string;
  type: TicketType;
  title: string;
  status: string;
  priority: TicketPriority;
  severity: TicketSeverity | null;
  env: TicketEnv | null;
  labels: string[];
  assignee: UserRef | null;
  /** Breadcrumb parents (spec 03: "Epic ▸ Story", hidden for epics). */
  epic: TicketRef | null;
  story: TicketRef | null;
  sprintId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommentWithAuthor extends Comment {
  author: UserRef;
}

/** GET /tickets/:id (spec 05): the full row plus everything the detail view needs to render. */
export interface TicketDetail extends Ticket {
  assignee: UserRef | null;
  epic: TicketRef | null;
  story: TicketRef | null;
  comments: CommentWithAuthor[];
  /** Computed server-side from the ticket's type — the only statuses this ticket may take. */
  statusOptions: string[];
  /** Stories under this ticket's epic; the bug's story-link dropdown. Empty for non-bugs. */
  storyOptions: TicketRef[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// --- Overview dashboard (spec 01) ---

export interface StatusBreakdownEntry {
  status: string;
  count: number;
  /** Share of the project's tickets, 0-100, rounded to 1 decimal. 0 for an empty project. */
  pct: number;
}

export interface PriorityBreakdownEntry {
  priority: TicketPriority;
  count: number;
}

export interface OverviewStats {
  openCount: number;
  criticalOpen: number;
  /** Rounded to 1 decimal; 0 when the project has no Done tickets yet. */
  avgResolutionDays: number;
  createdThisWeek: number;
  statusBreakdown: StatusBreakdownEntry[];
  priorityBreakdown: PriorityBreakdownEntry[];
  /** The 5 most recently updated tickets, same shape as a list row. */
  recentActivity: TicketSummary[];
}
