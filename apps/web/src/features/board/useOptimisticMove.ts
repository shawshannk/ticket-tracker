import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BoardQuery, TicketSummary } from '@ticket-tracker/shared';
import { api } from '../../api/endpoints';
import { queryKeys } from '../../api/queries';

/**
 * R9 / spec 04: move the card in the cache the instant it's dropped, then roll back if the
 * API rejects it. On a board, a real network round-trip is long enough that waiting for the
 * response makes the drag feel broken.
 *
 * The rollback path is the one that matters: the server independently validates status
 * against the ticket's type (R1), so a 400 is possible even though the UI prevents invalid
 * drops — and the card must snap back rather than lie about its status.
 */
export function useOptimisticMove(projectId: string, query: BoardQuery) {
  const qc = useQueryClient();
  const key = queryKeys.board(projectId, query);

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.tickets.moveStatus(id, { status }),

    onMutate: async ({ id, status }) => {
      // Stop an in-flight refetch from overwriting the optimistic state mid-drag.
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<TicketSummary[]>(key);

      qc.setQueryData<TicketSummary[]>(key, (cards) =>
        cards?.map((card) => (card.id === id ? { ...card, status } : card)),
      );

      return { previous };
    },

    onError: (_error, _vars, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },

    onSettled: () => {
      // Reconcile with the server either way — the move also bumps updated_at, which the
      // overview's "recently updated" and KPIs depend on.
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: queryKeys.overview(projectId) });
      qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}
