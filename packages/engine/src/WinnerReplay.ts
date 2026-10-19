import {
  ErrorUpdate,
  GameUpdateType,
  HashUpdate,
  WinUpdate,
} from "@openfront/engine-api/game/GameUpdates";
import { MapFiles } from "@openfront/engine-api/game/MapFiles";
import {
  AllPlayersStats,
  GameStartInfo,
  Turn,
  Winner,
} from "@openfront/engine-api/Schemas";
import { createGameRunner } from "./GameRunner";

export interface ReplayedWinner {
  // undefined when the turns run out before anyone wins, or the match was
  // cancelled (a winnerless Win update).
  winner: Winner;
  allPlayersStats: AllPlayersStats;
  // The tick the simulation declared the result on; null if it never did.
  tick: number | null;
  // mineclash #24: first turn whose recorded state checksum differs from the
  // replay's (null = all recorded ones matched up to the result).
  firstHashMismatch?: number | null;
  // mineclash: humans that spawned (stake: the others keep their stake).
  spawnedClientIds?: string[];
}

/**
 * Re-runs a game from its start info, turn log and map files and reports the
 * first result the simulation reaches — the same Win update every in-sync client
 * votes on. The server's own check on a disputed winner vote; it runs in a
 * subprocess (src/server/WinnerReplayChild.ts), the one place the server
 * loads the engine.
 */
export async function replayWinner(
  gameStart: GameStartInfo,
  turns: Turn[],
  map: MapFiles,
): Promise<ReplayedWinner> {
  let win: WinUpdate | null = null;
  let error: ErrorUpdate | null = null;
  let tickHash: HashUpdate | null = null;
  let firstHashMismatch: number | null = null;
  const runner = await createGameRunner(gameStart, undefined, map, (gu) => {
    if ("errMsg" in gu) {
      error = gu;
      return;
    }
    win ??= gu.updates[GameUpdateType.Win][0] ?? null;
    tickHash = gu.updates[GameUpdateType.Hash][0] ?? null;
  });
  const spawned = () =>
    runner.game
      .allPlayers()
      .filter((p) => p.hasSpawned())
      .flatMap((p) => p.clientID() ?? []);
  for (const turn of turns) {
    runner.addTurn(turn);
    if (!runner.executeNextTick()) {
      const err = error as ErrorUpdate | null;
      throw new Error(
        `replay failed at turn ${turn.turnNumber}: ${err?.errMsg}\n${err?.stack}`,
      );
    }
    // mineclash #24: compare with the checksum the clients agreed on.
    const h = tickHash as HashUpdate | null;
    if (
      h !== null &&
      h.tick === turn.turnNumber &&
      turn.hash !== undefined &&
      turn.hash !== null &&
      h.hash !== turn.hash
    ) {
      firstHashMismatch ??= turn.turnNumber;
    }
    if (win !== null) {
      const w = win as WinUpdate;
      return {
        winner: w.winner,
        allPlayersStats: w.allPlayersStats,
        tick: runner.game.ticks(),
        firstHashMismatch,
        spawnedClientIds: spawned(),
      };
    }
  }
  return {
    winner: undefined,
    allPlayersStats: runner.game.stats().stats(),
    tick: null,
    firstHashMismatch,
    spawnedClientIds: spawned(),
  };
}
