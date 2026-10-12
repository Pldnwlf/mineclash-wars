import { GameMapSize } from "@openfront/engine-api/game/GameTypes";
import {
  GameUpdateType,
  WinUpdate,
} from "@openfront/engine-api/game/GameUpdates";
import { GameStartInfo, Turn } from "@openfront/engine-api/Schemas";
import { createGameRunner } from "@openfront/engine/GameRunner";
import { replayWinner } from "@openfront/engine/WinnerReplay";
import { loadMapFiles } from "@openfront/shared/GameMapLoader";
import { describe, expect, it } from "vitest";
import { mineclashResult } from "../../src/server/MineclashVerify";
import { scriptedGameStart, TestDataMapLoader } from "../util/ScriptedGame";

const [P1, P2] = ["HUMAN001", "HUMAN002"];

// mineclash #24: real engine replay of a stake-rule match (ends at minute 1),
// the checksums recorded by the "clients" are checked by the server replay.
function gameStart(): GameStartInfo {
  const start = scriptedGameStart({
    gameMapSize: GameMapSize.Normal,
    nations: "disabled",
    bots: 0,
    mineclashRules: { endMinutes: 1 },
  });
  return { ...start, players: start.players.slice(0, 2) };
}
const mapFiles = () =>
  loadMapFiles(
    new TestDataMapLoader("plains"),
    gameStart().config.gameMap,
    GameMapSize.Normal,
  );

async function playLive(): Promise<{ turns: Turn[]; win: WinUpdate }> {
  let win: WinUpdate | null = null;
  let hash: number | null = null;
  const runner = await createGameRunner(
    gameStart(),
    undefined,
    await mapFiles(),
    (gu) => {
      if ("errMsg" in gu) throw new Error(gu.errMsg);
      win ??= gu.updates[GameUpdateType.Win][0] ?? null;
      hash = gu.updates[GameUpdateType.Hash][0]?.hash ?? null;
    },
  );
  const game = runner.game;
  const turns: Turn[] = [];
  for (let tick = 0; win === null; tick++) {
    if (tick > 5000) throw new Error("live game never produced a winner");
    const turn: Turn = { turnNumber: tick, intents: [] };
    if (tick === 5) {
      turn.intents.push(
        { type: "spawn", tile: game.ref(20, 20), clientID: P1 },
        { type: "spawn", tile: game.ref(80, 80), clientID: P2 },
      );
    }
    turns.push(turn);
    runner.addTurn(turn);
    runner.executeNextTick();
    // what GameServer records once the clients agree
    if (hash !== null) turn.hash = hash;
  }
  return { turns, win };
}

describe("server replay of a mineclash match", () => {
  it("matches the live result and checksums; yields winners", async () => {
    const { turns, win } = await playLive();
    expect(
      turns.filter((t) => (t.hash ?? null) !== null).length,
    ).toBeGreaterThan(10);
    const t0 = performance.now();
    const rep = await replayWinner(gameStart(), turns, await mapFiles());
    console.log(
      `replay ${turns.length} ticks in ${Math.round(performance.now() - t0)} ms`,
    );
    expect(rep.winner).toEqual(win.winner);
    expect(rep.firstHashMismatch).toBeNull();
    const res = mineclashResult(gameStart(), rep, win.winner, true);
    expect(res.kind).toBe("winners");
  });

  it("tampered checksum => mismatch => refund", async () => {
    const { turns } = await playLive();
    const idx = turns.findIndex(
      (t) => (t.hash ?? null) !== null && t.turnNumber > 100,
    );
    turns[idx] = { ...turns[idx], hash: turns[idx].hash! + 1 };
    const rep = await replayWinner(gameStart(), turns, await mapFiles());
    expect(rep.firstHashMismatch).toBe(turns[idx].turnNumber);
    expect(mineclashResult(gameStart(), rep)).toEqual({
      kind: "refund",
      reason: "mismatch",
    });
  });

  it("tampered intents (different play than recorded) => mismatch", async () => {
    const { turns } = await playLive();
    // P2 never spawns in the replay: the recorded checksums no longer fit.
    const forged = turns.map((t) => ({
      ...t,
      intents: t.intents.filter((i) => !("clientID" in i) || i.clientID !== P2),
    }));
    const rep = await replayWinner(gameStart(), forged, await mapFiles());
    expect(rep.firstHashMismatch).not.toBeNull();
    expect(mineclashResult(gameStart(), rep)).toEqual({
      kind: "refund",
      reason: "mismatch",
    });
  });
});
