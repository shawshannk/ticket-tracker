import { z } from 'zod';
import type { Department, TicketEnv, TicketPriority, TicketSeverity, TicketSize, TicketType, UserRole } from './enums';
import {
  bugCreateSchema,
  commentCreateSchema,
  epicCreateSchema,
  moveTicketStatusSchema,
  projectCreateSchema,
  storyCreateSchema,
  ticketCreateSchema,
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
