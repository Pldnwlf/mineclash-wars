import { describe, expect, it } from "vitest";
import { buildBoard } from "../../src/client/mineclash/CompactLeaderboard";
import type { GameView, PlayerView } from "../../src/client/view";

const player = (name: string, tiles: number, gold = 0, alive = true) =>
  ({
    name: () => name,
    numTilesOwned: () => tiles,
    gold: () => BigInt(gold),
    troops: () => 0,
    isAlive: () => alive,
  }) as unknown as PlayerView;

const game = (players: PlayerView[], me: PlayerView | null) =>
  ({ playerViews: () => players, myPlayer: () => me }) as unknown as GameView;

describe("buildBoard", () => {
  const ps = [1, 2, 3, 4, 5, 6, 7].map((n) => player(`p${n}`, n * 10, 70 - n));
  const dead = player("dead", 999, 0, false);

  it("shows top 5 by tiles and pins own row", () => {
    const b = buildBoard(game([...ps, dead], ps[0]), "tiles", false);
    expect(b.shown.map((r) => r.player.name())).toEqual([
      "p7",
      "p6",
      "p5",
      "p4",
      "p3",
    ]);
    expect(b.pinned?.player.name()).toBe("p1");
    expect(b.pinned?.rank).toBe(7);
    expect(b.total).toBe(7);
  });

  it("no pin when own row is shown or expanded", () => {
    expect(buildBoard(game(ps, ps[6]), "tiles", false).pinned).toBeNull();
    const b = buildBoard(game(ps, ps[0]), "tiles", true);
    expect(b.shown).toHaveLength(7);
    expect(b.pinned).toBeNull();
  });

  it("sorts by gold", () => {
    const b = buildBoard(game(ps, null), "gold", false);
    expect(b.shown[0].player.name()).toBe("p1");
    expect(b.pinned).toBeNull();
  });
});
