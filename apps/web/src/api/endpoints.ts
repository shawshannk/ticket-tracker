import type {
  AuthResult,
  BoardQuery,
  Comment,
  CommentCreateDto,
  InvitePreview,
  Membership,
  MoveTicketStatusDto,
  OverviewStats,
  Paged,
  Project,
  ProjectCreateDto,
  ProjectMemberSummary,
  SessionSummary,
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
 *
 * No function takes an acting user any more: `client.ts` attaches the bearer token, so identity
 * is not something a call site can pass, forget, or get wrong (R11).
 */

export const api = {
  auth: {
    /** 401 here means "wrong password", so it must not trigger a token refresh. */
    login: (email: string, password: string) =>
      apiFetch<AuthResult>('/auth/login', { method: 'POST', body: { email, password }, skipAuthRefresh: true }),
    logout: (allSessions = false) =>
      apiFetch<void>('/auth/logout', { method: 'POST', body: { allSessions } }),
    me: () => apiFetch<{ user: User; memberships: Membership[] }>('/auth/me'),
    changePassword: (currentPassword: string, newPassword: string) =>
      apiFetch<void>('/auth/password', { method: 'POST', body: { currentPassword, newPassword } }),
    invitePreview: (token: string) =>
      apiFetch<InvitePreview>(`/auth/invite/${encodeURIComponent(token)}`, { skipAuthRefresh: true }),
    acceptInvite: (token: string, password: string) =>
      apiFetch<AuthResult>('/auth/invite/accept', { method: 'POST', body: { token, password }, skipAuthRefresh: true }),
    sessions: () => apiFetch<SessionSummary[]>('/auth/sessions'),
    revokeSession: (id: string) => apiFetch<void>(`/auth/sessions/${id}`, { method: 'DELETE' }),
  },

  users: {
    list: () => apiFetch<User[]>('/users'),
    get: (id: string) => apiFetch<User>(`/users/${id}`),
    create: (body: UserCreateDto) => apiFetch<UserCreatedResult>('/users', { method: 'POST', body }),
    update: (id: string, body: UserUpdateDto) => apiFetch<User>(`/users/${id}`, { method: 'PATCH', body }),
  },

  projects: {
    /** Server-filtered to the caller's memberships (R12) — there is no "all projects" call. */
    list: () => apiFetch<Project[]>('/projects'),
    get: (id: string) => apiFetch<Project>(`/projects/${id}`),
    sprints: (id: string) => apiFetch<Sprint[]>(`/projects/${id}/sprints`),
    create: (body: ProjectCreateDto) => apiFetch<Project>('/projects', { method: 'POST', body }),
    members: (id: string) => apiFetch<ProjectMemberSummary[]>(`/projects/${id}/members`),
  },

  tickets: {
    list: (projectId: string, query: Partial<TicketListQuery>) =>
      apiFetch<Paged<TicketSummary>>(`/projects/${projectId}/tickets`, { query }),
    board: (projectId: string, query: BoardQuery) =>
      apiFetch<TicketSummary[]>(`/projects/${projectId}/board`, { query }),
    overview: (projectId: string) => apiFetch<OverviewStats>(`/projects/${projectId}/overview`),
    detail: (id: string) => apiFetch<TicketDetail>(`/tickets/${id}`),
    create: (projectId: string, body: TicketCreateDto) =>
      apiFetch<Ticket>(`/projects/${projectId}/tickets`, { method: 'POST', body }),
    update: (id: string, body: TicketUpdateDto) =>
      apiFetch<Ticket>(`/tickets/${id}`, { method: 'PATCH', body }),
    moveStatus: (id: string, body: MoveTicketStatusDto) =>
      apiFetch<Ticket>(`/tickets/${id}/status`, { method: 'PATCH', body }),
    remove: (id: string) => apiFetch<void>(`/tickets/${id}`, { method: 'DELETE' }),
    addComment: (id: string, body: CommentCreateDto) =>
      apiFetch<Comment>(`/tickets/${id}/comments`, { method: 'POST', body }),
  },
};
