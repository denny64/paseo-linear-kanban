import type { PaseoProject } from "./paseo-types";
import { useRpc } from "@getpaseo/plugin/client";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { archiveCardRpc, type Card, type ColumnId, loadBoardRpc, moveCardRpc, type Team } from "../shared/board";

type Board = { team: Team; cards: Card[] };

// A project whose board is a Linear team's issues.
export type LinkedProject = { project: PaseoProject; teamId: string };

// A card plus where it lives, so one view can mix teams.
export type BoardCard = Card & { key: string; team: Team; project: PaseoProject };

export function boardCard(card: Card, team: Team, project: PaseoProject): BoardCard {
  return { ...card, key: card.id, team, project };
}

const boardKey = (teamId: string) => ["board", teamId];

// One query per team, shared with the single-project view's cache.
export function useBoards(linked: readonly LinkedProject[], refetchInterval: number) {
  const loadBoard = useRpc(loadBoardRpc);
  const queries = useQueries({
    queries: linked.map(({ teamId }) => ({
      queryKey: boardKey(teamId),
      queryFn: () => loadBoard({ teamId }),
      refetchInterval,
      staleTime: 30_000,
    })),
  });

  const cards: BoardCard[] = [];
  const teams: { project: PaseoProject; team: Team }[] = [];
  const failed: { project: PaseoProject; error: unknown }[] = [];
  queries.forEach((query, index) => {
    const { project } = linked[index];
    if (query.error) failed.push({ project, error: query.error });
    // Two projects on the same team would show every card twice; keep the first.
    if (!query.data || teams.some((t) => t.team.id === query.data.team.id)) return;
    const { team } = query.data;
    teams.push({ project, team });
    for (const card of query.data.cards) cards.push(boardCard(card, team, project));
  });
  cards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return {
    cards,
    teams,
    failed,
    // Show whatever has arrived rather than waiting on the slowest team.
    ready: queries.some((q) => q.data) || queries.every((q) => !q.isPending),
    fetching: queries.some((q) => q.isFetching),
    refetch: () => Promise.all(queries.map((q) => q.refetch())),
  };
}

export function usePutCard() {
  const queryClient = useQueryClient();
  return (team: Team, card: Card) =>
    queryClient.setQueryData<Board>(boardKey(team.id), (board) =>
      board && {
        ...board,
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
    mutationFn: ({ card, column }: { card: BoardCard; column: ColumnId }) => moveCard({ id: card.id, column }),
    onMutate: async ({ card, column }) => {
      const { key: _key, team, project: _project, ...data } = card;
      await queryClient.cancelQueries({ queryKey: boardKey(team.id) });
      const previous = queryClient.getQueryData<Board>(boardKey(team.id));
      putCard(team, { ...data, column });
      return { previous };
    },
    onError: (error, { card }, context) => {
      queryClient.setQueryData(boardKey(card.team.id), context?.previous);
      onError(error);
    },
    onSuccess: (updated, { card }) => putCard(card.team, updated),
  });
}

export function useArchiveCard(onError: (error: unknown) => void) {
  const queryClient = useQueryClient();
  const archiveCard = useRpc(archiveCardRpc);
  return useMutation({
    mutationFn: (card: BoardCard) => archiveCard({ id: card.id }),
    onMutate: async (card) => {
      const key = boardKey(card.team.id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Board>(key);
      queryClient.setQueryData<Board>(key, (board) =>
        board && { ...board, cards: board.cards.filter((c) => c.id !== card.id) },
      );
      return { previous };
    },
    onError: (error, card, context) => {
      queryClient.setQueryData(boardKey(card.team.id), context?.previous);
      onError(error);
    },
  });
}
