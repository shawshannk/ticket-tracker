import type {
  BoardQuery,
  Comment,
  CommentCreateDto,
  MoveTicketStatusDto,
  OverviewStats,
  Paged,
  Project,
  ProjectCreateDto,
  Sprint,
  Ticket,
  TicketCreateDto,
  TicketDetail,
  TicketListQuery,
  TicketSummary,
  TicketUpdateDto,
  User,
  UserCreateDto,
  UserCreatedResult,
  UserUpdateDto,
} from '@ticket-tracker/shared';
import { apiFetch } from './client';

/**
 * One function per API route, typed with the shared DTOs. Views never call `apiFetch`
 * directly — they go through the query/mutation hooks, which go through here.
 */

export const api = {
  users: {
    list: () => apiFetch<User[]>('/users'),
    get: (id: string) => apiFetch<User>(`/users/${id}`),
    create: (body: UserCreateDto, actingUserId: string | null) =>
      apiFetch<UserCreatedResult>('/users', { method: 'POST', body, actingUserId }),
    update: (id: string, body: UserUpdateDto, actingUserId: string | null) =>
      apiFetch<User>(`/users/${id}`, { method: 'PATCH', body, actingUserId }),
  },

  projects: {
    list: () => apiFetch<Project[]>('/projects'),
    get: (id: string) => apiFetch<Project>(`/projects/${id}`),
    sprints: (id: string) => apiFetch<Sprint[]>(`/projects/${id}/sprints`),
    create: (body: ProjectCreateDto, actingUserId: string | null) =>
      apiFetch<Project>('/projects', { method: 'POST', body, actingUserId }),
  },

  tickets: {
    list: (projectId: string, query: Partial<TicketListQuery>) =>
      apiFetch<Paged<TicketSummary>>(`/projects/${projectId}/tickets`, { query }),
    board: (projectId: string, query: BoardQuery) =>
      apiFetch<TicketSummary[]>(`/projects/${projectId}/board`, { query }),
    overview: (projectId: string) => apiFetch<OverviewStats>(`/projects/${projectId}/overview`),
    detail: (id: string) => apiFetch<TicketDetail>(`/tickets/${id}`),
    create: (projectId: string, body: TicketCreateDto, actingUserId: string | null) =>
      apiFetch<Ticket>(`/projects/${projectId}/tickets`, { method: 'POST', body, actingUserId }),
    update: (id: string, body: TicketUpdateDto, actingUserId: string | null) =>
      apiFetch<Ticket>(`/tickets/${id}`, { method: 'PATCH', body, actingUserId }),
    moveStatus: (id: string, body: MoveTicketStatusDto, actingUserId: string | null) =>
      apiFetch<Ticket>(`/tickets/${id}/status`, { method: 'PATCH', body, actingUserId }),
    remove: (id: string, actingUserId: string | null) =>
      apiFetch<void>(`/tickets/${id}`, { method: 'DELETE', actingUserId }),
    addComment: (id: string, body: CommentCreateDto, actingUserId: string | null) =>
      apiFetch<Comment>(`/tickets/${id}/comments`, { method: 'POST', body, actingUserId }),
  },
};
