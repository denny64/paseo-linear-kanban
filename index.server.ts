import type { PluginServerContext } from "@getpaseo/plugin/server";
import { archiveCard, createCard, listTeams, loadBoard, moveCard } from "./server/board";
import { connectSettings } from "./server/linear";
import { archiveCardRpc, boardSettings, createCardRpc, listTeamsRpc, loadBoardRpc, moveCardRpc } from "./shared/board";

export default function contribute(server: PluginServerContext) {
  connectSettings(server.registerSettings(boardSettings));
  server.handle(listTeamsRpc, listTeams);
  server.handle(loadBoardRpc, loadBoard);
  server.handle(createCardRpc, createCard);
  server.handle(moveCardRpc, moveCard);
  server.handle(archiveCardRpc, archiveCard);
  return () => {};
}
