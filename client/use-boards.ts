import { useRpc } from "@getpaseo/plugin/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { archiveCardRpc, type Card, type ColumnId, loadBoardRpc, moveCardRpc } from "../shared/board";

type Board = { cards: Card[] };

const BOARD_KEY = ["board"];

// Key for where a card's agents run: its Linear project, else its team.
export const repoKey = (projectId: string | null | undefined, teamId: string | undefined) => projectId ?? `team:${teamId}`;

export function useBoard(enabled: boolean) {
  const loadBoard = useRpc(loadBoardRpc);
  return useQuery({
    queryKey: BOARD_KEY,
    queryFn: () => loadBoard({}),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function usePutCard() {
  const queryClient = useQueryClient();
  return (card: Card) =>
    queryClient.setQueryData<Board>(BOARD_KEY, (board) =>
      board && {
        cards: board.cards.some((c) => c.id === card.id)
          ? board.cards.map((c) => (c.id === card.id ? card : c))
          : [card, ...board.cards],
      },
    );
}

export function useMoveCard(onError: (error: unknown) => void) {
  const queryClient = useQueryClient();
  const moveCard = useRpc(moveCardRpc);
  const putCard = usePutCard();
  return useMutation({
    mutationFn: ({ card, column }: { card: Card; column: ColumnId }) => moveCard({ id: card.id, column }),
    onMutate: async ({ card, column }) => {
      await queryClient.cancelQueries({ queryKey: BOARD_KEY });
      const previous = queryClient.getQueryData<Board>(BOARD_KEY);
      putCard({ ...card, column });
      return { previous };
    },
    onError: (error, _input, context) => {
      queryClient.setQueryData(BOARD_KEY, context?.previous);
      onError(error);
    },
    onSuccess: (updated) => putCard(updated),
  });
}

export function useArchiveCard(onError: (error: unknown) => void) {
  const queryClient = useQueryClient();
  const archiveCard = useRpc(archiveCardRpc);
  return useMutation({
    mutationFn: (card: Card) => archiveCard({ id: card.id }),
    onMutate: async (card) => {
      await queryClient.cancelQueries({ queryKey: BOARD_KEY });
      const previous = queryClient.getQueryData<Board>(BOARD_KEY);
      queryClient.setQueryData<Board>(BOARD_KEY, (board) =>
        board && { cards: board.cards.filter((c) => c.id !== card.id) },
      );
      return { previous };
    },
    onError: (error, _card, context) => {
      queryClient.setQueryData(BOARD_KEY, context?.previous);
      onError(error);
    },
  });
}
