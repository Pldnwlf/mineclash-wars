import { GameType } from "@openfront/engine-api/game/GameTypes";
import { GameStartInfo, Winner } from "@openfront/engine-api/Schemas";
import type { ReplayedWinner } from "@openfront/engine/WinnerReplay";
import { describe, expect, it, vi } from "vitest";
import { Client } from "../../src/server/Client";
import {
  type MineclashResult,
  mineclashResult,
} from "../../src/server/MineclashVerify";
import {
  cid,
  makeClient,
  makeGame,
  mockWsOf,
  startGame,
} from "../util/GameServerHarness";

const A = cid("alice");
const B = cid("bob");
const replayed = (
  winner: Winner,
  extra: Partial<ReplayedWinner> = {},
): ReplayedWinner => ({
  winner,
  allPlayersStats: {},
  tick: 100,
  firstHashMismatch: null,
  ...extra,
});
const start = (ids: string[]) =>
  ({
    players: ids.map((clientID) => ({ clientID })),
  }) as unknown as GameStartInfo;

describe("mineclashResult (pure)", () => {
  const r = (
    ids: string[],
    rep: ReplayedWinner | null,
    voted?: Winner,
    decided = false,
  ) => mineclashResult(start(ids), rep, voted, decided);

  it("single winner", () => {
    expect(r([A, B], replayed(["player", A]))).toEqual({
      kind: "winners",
      clientIds: [A],
    });
  });
  it("tie => several winners", () => {
    expect(r([A, B], replayed(["player", A, B]))).toEqual({
      kind: "winners",
      clientIds: [A, B],
    });
  });
  it("team win carries the team", () => {
    expect(r([A, B], replayed(["team", "Red", A, B]))).toEqual({
      kind: "winners",
      clientIds: [A, B],
      team: "Red",
    });
  });
  it("no human winner => refund", () => {
    for (const w of [["none"], ["nation", "Rome"]] as Winner[]) {
      expect(r([A, B], replayed(w))).toEqual({
        kind: "refund",
        reason: "no_human_winner",
      });
    }
  });
  it("< 2 humans => refund, even with a winner", () => {
    expect(r([A], replayed(["player", A]))).toEqual({
      kind: "refund",
      reason: "too_few_humans",
    });
  });
  it("hash mismatch => refund", () => {
    expect(
      r([A, B], replayed(["player", A], { firstHashMismatch: 40 })),
    ).toEqual({ kind: "refund", reason: "mismatch" });
  });
  it("decided vote disagreeing with the replay => refund", () => {
    expect(r([A, B], replayed(["player", A]), ["player", B], true)).toEqual({
      kind: "refund",
      reason: "mismatch",
    });
  });
  it("failed replay / no result / unknown winner", () => {
    expect(r([A, B], null)).toEqual({ kind: "refund", reason: "error" });
    expect(r([A, B], replayed(undefined, { tick: null }))).toEqual({
      kind: "refund",
      reason: "aborted",
    });
    expect(r([A, B], replayed(["player", cid("mallory")]))).toEqual({
      kind: "refund",
      reason: "error",
    });
  });
});

describe("GameServer: binding result of a mineclash match", () => {
  function play(
    rep: ReplayedWinner | null,
    mineclash = true,
    ids: string[] = [A, B],
  ) {
    const results: [string, MineclashResult][] = [];
    const archive = vi.fn(async () => {});
    const replayWinner = vi.fn(async () => rep);
    const game = makeGame({
      config: {
        gameType: GameType.Public,
        ...(mineclash ? { mineclashRules: { endMinutes: 25 } } : {}),
      },
      deps: {
        archive,
        replayWinner,
        onMineclashResult: (id, result) => results.push([id, result]),
      },
    });
    const clients = ids.map((clientID, i) =>
      makeClient({ clientID, ip: `1.1.1.${i + 1}` }),
    );
    clients.forEach((c) => game.joinClient(c));
    startGame(game);
    return { game, clients, results, archive, replayWinner };
  }
  const vote = (c: Client, winner: Winner) =>
    mockWsOf(c).emit({ type: "winner", winner, allPlayersStats: {} });
  const settled = (results: unknown[]) =>
    vi.waitFor(() => expect(results.length).toBe(1));

  it("a forged vote does not change the result", async () => {
    const { game, clients, results, archive } = play(replayed(["player", B]));
    await vote(clients[0], ["player", A]); // cheater names itself
    await vote(clients[1], ["player", B]);
    await game.end(); // no majority: settled at match end by the replay
    await settled(results);
    expect(results[0][1]).toEqual({ kind: "winners", clientIds: [B] });
    expect(archive).toHaveBeenCalledTimes(1);
  });

  it("a colluding majority vote against the replay => refund", async () => {
    const { clients, results } = play(replayed(["player", B]));
    await vote(clients[0], ["player", A]);
    await vote(clients[1], ["player", A]);
    await settled(results);
    expect(results[0][1]).toEqual({ kind: "refund", reason: "mismatch" });
  });

  it("hash mismatch => refund", async () => {
    const { clients, results } = play(
      replayed(["player", A], { firstHashMismatch: 5 }),
    );
    await vote(clients[0], ["player", A]);
    await vote(clients[1], ["player", A]);
    await settled(results);
    expect(results[0][1]).toEqual({ kind: "refund", reason: "mismatch" });
  });

  it("tie => both win", async () => {
    const { clients, results } = play(replayed(["player", A, B]));
    await vote(clients[0], ["player", A, B]);
    await vote(clients[1], ["player", A, B]);
    await settled(results);
    expect(results[0][1]).toEqual({ kind: "winners", clientIds: [A, B] });
  });

  it("no human winner => refund", async () => {
    const { clients, results } = play(replayed(["none"]));
    await vote(clients[0], ["none"]);
    await vote(clients[1], ["none"]);
    await settled(results);
    expect(results[0][1]).toEqual({
      kind: "refund",
      reason: "no_human_winner",
    });
  });

  it("a lone survivor's vote does not decide; end() runs the replay", async () => {
    const { game, clients, results, replayWinner } = play(
      replayed(["player", B]),
    );
    await vote(clients[0], ["player", A]);
    await mockWsOf(clients[1]).trigger("close"); // the other one drops
    expect(replayWinner).not.toHaveBeenCalled();
    expect(results).toEqual([]);
    await game.end();
    await settled(results);
    expect(results[0][1]).toEqual({ kind: "winners", clientIds: [B] });
  });

  it("a premature vote (no result in the turns yet) waits for end()", async () => {
    const { game, clients, results, replayWinner } = play(
      replayed(undefined, { tick: null }),
    );
    await vote(clients[0], ["player", A]);
    await vote(clients[1], ["player", A]);
    await vi.waitFor(() => expect(replayWinner).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(results).toEqual([]);
    await game.end();
    await settled(results);
    expect(results[0][1]).toEqual({ kind: "refund", reason: "aborted" });
  });

  it("no votes at all: end() still settles by replay", async () => {
    const { game, results } = play(replayed(["player", A]));
    await game.end();
    await settled(results);
    expect(results[0][1]).toEqual({ kind: "winners", clientIds: [A] });
  });

  it("replay failure => refund error", async () => {
    const { clients, results } = play(null);
    await vote(clients[0], ["player", A]);
    await vote(clients[1], ["player", A]);
    await settled(results);
    expect(results[0][1]).toEqual({ kind: "refund", reason: "error" });
  });

  it("< 2 humans => refund", async () => {
    const { clients, results } = play(replayed(["player", A]), true, [A]);
    await vote(clients[0], ["player", A]);
    await settled(results);
    expect(results[0][1]).toEqual({ kind: "refund", reason: "too_few_humans" });
  });

  it("matches without mineclashRules are untouched", async () => {
    const { clients, results, archive, replayWinner } = play(
      replayed(["player", B]),
      false,
    );
    await vote(clients[0], ["player", A]);
    await vote(clients[1], ["player", A]);
    expect(replayWinner).not.toHaveBeenCalled();
    expect(archive).toHaveBeenCalledTimes(1);
    expect(results).toEqual([]);
  });
});
