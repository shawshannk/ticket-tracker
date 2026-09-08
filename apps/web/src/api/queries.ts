import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  BoardQuery,
  CommentCreateDto,
  MoveTicketStatusDto,
  TicketCreateDto,
  TicketListQuery,
  TicketUpdateDto,
} from '@ticket-tracker/shared';
import { useActingUserId } from '../store/actingUser';
import { api } from './endpoints';

/**
 * Query keys in one place so invalidation is exact. A ticket mutation touches the detail, the
 * list, the board and the overview (spec 05), so mutations invalidate the whole project
 * subtree rather than trying to name each affected query.
 */
export const queryKeys = {
  users: ['users'] as const,
  user: (id: string) => ['users', id] as const,
  projects: ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
  sprints: (projectId: string) => ['projects', projectId, 'sprints'] as const,
  tickets: (projectId: string, query: Partial<TicketListQuery>) =>
    ['projects', projectId, 'tickets', query] as const,
  board: (projectId: string, query: BoardQuery) => ['projects', projectId, 'board', query] as const,
  overview: (projectId: string) => ['projects', projectId, 'overview'] as const,
  ticket: (id: string) => ['tickets', id] as const,
};

/** Everything scoped to a project, so a mutation can refresh all of its views at once. */
function invalidateProject(qc: QueryClient, projectId: string | undefined) {
  qc.invalidateQueries({ queryKey: ['tickets'] });
  if (projectId) qc.invalidateQueries({ queryKey: ['projects', projectId] });
}

// --- Reads ---

export const useUsers = () => useQuery({ queryKey: queryKeys.users, queryFn: api.users.list });
export const useProjects = () => useQuery({ queryKey: queryKeys.projects, queryFn: api.projects.list });

export const useProject = (id: string) =>
  useQuery({ queryKey: queryKeys.project(id), queryFn: () => api.projects.get(id), enabled: Boolean(id) });

export const useSprints = (projectId: string) =>
  useQuery({ queryKey: queryKeys.sprints(projectId), queryFn: () => api.projects.sprints(projectId), enabled: Boolean(projectId) });

export const useTickets = (projectId: string, query: Partial<TicketListQuery>) =>
  useQuery({ queryKey: queryKeys.tickets(projectId, query), queryFn: () => api.tickets.list(projectId, query), enabled: Boolean(projectId) });

export const useBoard = (projectId: string, query: BoardQuery) =>
  useQuery({ queryKey: queryKeys.board(projectId, query), queryFn: () => api.tickets.board(projectId, query), enabled: Boolean(projectId) });

export const useOverview = (projectId: string) =>
  useQuery({ queryKey: queryKeys.overview(projectId), queryFn: () => api.tickets.overview(projectId), enabled: Boolean(projectId) });

export const useTicket = (id: string) =>
  useQuery({ queryKey: queryKeys.ticket(id), queryFn: () => api.tickets.detail(id), enabled: Boolean(id) });

// --- Mutations ---
// Each reads the acting user from the store itself, so no call site can forget to pass it.

export function useCreateTicket(projectId: string) {
  const actingUserId = useActingUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TicketCreateDto) => api.tickets.create(projectId, body, actingUserId),
    onSuccess: () => invalidateProject(qc, projectId),
  });
}

export function useUpdateTicket(projectId?: string) {
  const actingUserId = useActingUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: TicketUpdateDto }) => api.tickets.update(id, body, actingUserId),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.ticket(id) });
      invalidateProject(qc, projectId);
    },
  });
}

export function useMoveTicketStatus(projectId?: string) {
  const actingUserId = useActingUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: MoveTicketStatusDto }) => api.tickets.moveStatus(id, body, actingUserId),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.ticket(id) });
      invalidateProject(qc, projectId);
    },
  });
}

export function useDeleteTicket(projectId?: string) {
  const actingUserId = useActingUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.tickets.remove(id, actingUserId),
    onSuccess: () => invalidateProject(qc, projectId),
  });
}

export function useAddComment(ticketId: string, projectId?: string) {
  const actingUserId = useActingUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CommentCreateDto) => api.tickets.addComment(ticketId, body, actingUserId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.ticket(ticketId) });
      invalidateProject(qc, projectId);
    },
  });
}
