import {
  GameMode,
  PlayerInfo,
  PlayerType,
} from "@openfront/engine-api/game/GameTypes";
import { WinnerSchema } from "@openfront/engine-api/Schemas";
import {
  checkMineclashWin,
  mineclashThreshold,
} from "@openfront/engine/execution/MineclashWinCheck";
import { WinCheckExecution } from "@openfront/engine/execution/WinCheckExecution";
import type { Player } from "@openfront/engine/game/Game";
import { setup } from "../../util/Setup";

const H = PlayerType.Human;
const N = PlayerType.Nation;
const B = PlayerType.Bot;

// 100x100 plains = 10000 land tiles, so 100 tiles = 1%.
// spec entries: [name, type, team?]
async function make(
  spec: [string, PlayerType, string?][],
  cfg: Record<string, unknown> = {},
) {
  const game = await setup("plains", {
    mineclashRules: { endMinutes: 25 },
    ...cfg,
  });
  const players: Player[] = spec.map(([n, t, team]) => {
    const info = new PlayerInfo(n, t, t === H ? n : null, n);
    (game as any).addPlayer(info, team);
    return game.player(n);
  });
  let cursor = 0;
  const give = (p: Player, count: number) => {
    for (let i = 0; i < count; i++) {
      let ref;
      do {
        ref = game.ref(cursor % 100, Math.floor(cursor / 100));
        cursor++;
      } while (!game.isLand(ref) || game.hasOwner(ref));
      p.conquer(ref);
    }
  };
  const wins: unknown[] = [];
  const orig = (game as any).addUpdate.bind(game);
  (game as any).addUpdate = (u: any) => {
    if ("allPlayersStats" in u) wins.push(u.winner);
    orig(u);
  };
  const at = (minutes: number) => {
    game.elapsedGameSeconds = () => minutes * 60;
  };
  at(1);
  return { game, players, give, wins, at };
}

describe("mineclash win rules", () => {
  it("threshold: 80 until min 15, -1 per min, 70 at min 25", () => {
    expect(mineclashThreshold(0)).toBe(80);
    expect(mineclashThreshold(15 * 60)).toBe(80);
    expect(mineclashThreshold(15 * 60 + 59)).toBe(80);
    expect(mineclashThreshold(16 * 60)).toBe(79);
    expect(mineclashThreshold(20 * 60)).toBe(75);
    expect(mineclashThreshold(25 * 60)).toBe(70);
  });

  it("without preset the OpenFront check runs unchanged", async () => {
    const { game } = await make(
      [
        ["h1", H],
        ["h2", H],
      ],
      { mineclashRules: undefined },
    );
    const spy = vi.spyOn(game, "setNoHumanWinner");
    const wc = new WinCheckExecution();
    wc.init(game, 0);
    wc.tick(10);
    expect(spy).not.toHaveBeenCalled();
  });

  it("nation above threshold: no human winner", async () => {
    const { game, players, give, wins } = await make([
      ["h1", H],
      ["h2", H],
      ["n1", N],
    ]);
    give(players[0], 100);
    give(players[1], 100);
    give(players[2], 8500);
    expect(checkMineclashWin(game)).toBe(true);
    expect(game.getWinner()).not.toBeNull();
    expect(wins).toEqual([["none"]]);
  });

  it("bot above threshold: no human winner", async () => {
    const { game, players, give, wins } = await make([
      ["h1", H],
      ["h2", H],
      ["b1", B],
    ]);
    give(players[0], 10);
    give(players[1], 10);
    give(players[2], 8500);
    expect(checkMineclashWin(game)).toBe(true);
    expect(wins).toEqual([["none"]]);
  });

  it("human over threshold wins; exactly 80% is not enough", async () => {
    const { game, players, give, wins } = await make([
      ["h1", H],
      ["h2", H],
    ]);
    give(players[0], 8000);
    give(players[1], 100);
    expect(checkMineclashWin(game)).toBe(false);
    give(players[0], 1);
    expect(checkMineclashWin(game)).toBe(true);
    expect(wins).toEqual([["player", "h1"]]);
  });

  it("overtime: 76% fails until the bar reaches 75% at min 20", async () => {
    const { game, players, give, wins, at } = await make([
      ["h1", H],
      ["h2", H],
    ]);
    give(players[0], 7600);
    give(players[1], 100);
    at(15);
    expect(checkMineclashWin(game)).toBe(false);
    at(19);
    expect(checkMineclashWin(game)).toBe(false); // bar 76
    at(20);
    expect(checkMineclashWin(game)).toBe(true); // bar 75
    expect(wins).toEqual([["player", "h1"]]);
  });

  it("min 25: human with most land wins, nation with more is ignored", async () => {
    const { game, players, give, wins, at } = await make([
      ["h1", H],
      ["h2", H],
      ["n1", N],
    ]);
    give(players[0], 1000);
    give(players[1], 2000);
    give(players[2], 3000);
    at(24);
    expect(checkMineclashWin(game)).toBe(false);
    at(25);
    expect(checkMineclashWin(game)).toBe(true);
    expect(wins).toEqual([["player", "h2"]]);
  });

  it("min 25 tie: all tied humans win (sorted ids)", async () => {
    const { game, players, give, wins, at } = await make([
      ["h2", H],
      ["h1", H],
      ["h3", H],
    ]);
    give(players[0], 1500);
    give(players[1], 1500);
    give(players[2], 500);
    at(25);
    expect(checkMineclashWin(game)).toBe(true);
    expect(wins).toEqual([["player", "h1", "h2"]]);
    expect(
      WinnerSchema.safeParse(["player", "AAAAAAAA", "BBBBBBBB"]).success,
    ).toBe(true);
    expect(WinnerSchema.safeParse(["none"]).success).toBe(true);
  });

  it("last human with land wins immediately, despite nations", async () => {
    const { game, players, give, wins } = await make([
      ["h1", H],
      ["h2", H],
      ["n1", N],
    ]);
    give(players[0], 10);
    give(players[2], 5000); // h2 has no tiles => eliminated
    expect(checkMineclashWin(game)).toBe(true);
    expect(wins).toEqual([["player", "h1"]]);
  });

  it("all humans eliminated: no human winner", async () => {
    const { game, players, give, wins } = await make([
      ["h1", H],
      ["n1", N],
    ]);
    give(players[1], 100);
    expect(checkMineclashWin(game)).toBe(true);
    expect(wins).toEqual([["none"]]);
  });

  it("single-human game does not end instantly", async () => {
    const { game, players, give } = await make([
      ["h1", H],
      ["n1", N],
    ]);
    give(players[0], 10);
    give(players[1], 100);
    expect(checkMineclashWin(game)).toBe(false);
  });

  it("disconnect is not an elimination", async () => {
    const { game, players, give, wins, at } = await make([
      ["h1", H],
      ["h2", H],
    ]);
    give(players[0], 100);
    give(players[1], 200);
    players[1].markDisconnected(true);
    expect(checkMineclashWin(game)).toBe(false);
    at(25);
    expect(checkMineclashWin(game)).toBe(true);
    expect(wins).toEqual([["player", "h2"]]);
  });

  it("host timer shorter than 25 min ends earlier", async () => {
    const { game, players, give, wins, at } = await make(
      [
        ["h1", H],
        ["h2", H],
      ],
      { maxTimerValue: 10 },
    );
    give(players[0], 300);
    give(players[1], 200);
    at(10);
    expect(checkMineclashWin(game)).toBe(true);
    expect(wins).toEqual([["player", "h1"]]);
  });

  it("runs through WinCheckExecution and deactivates it", async () => {
    const { game, players, give } = await make([
      ["h1", H],
      ["h2", H],
    ]);
    give(players[0], 9000);
    give(players[1], 10);
    const wc = new WinCheckExecution();
    wc.init(game, 0);
    wc.tick(10);
    expect(wc.isActive()).toBe(false);
  });
});

describe("mineclash win rules: teams", () => {
  const cfg = { gameMode: GameMode.Team, playerTeams: 2 };

  it("min 25: winning team lists all its humans, incl. disconnected", async () => {
    const { game, players, give, wins, at } = await make(
      [
        ["h1", H, "Red"],
        ["h2", H, "Red"],
        ["h3", H, "Blue"],
      ],
      cfg,
    );
    give(players[0], 1000);
    give(players[1], 1000);
    give(players[2], 1500);
    players[1].markDisconnected(true);
    at(25);
    expect(checkMineclashWin(game)).toBe(true);
    expect(wins).toEqual([["team", "Red", "h1", "h2"]]);
    expect(game.getWinner()).toBe("Red");
  });

  it("team over threshold with a human wins, humans of that team only", async () => {
    const { game, players, give, wins } = await make(
      [
        ["h1", H, "Red"],
        ["h2", H, "Blue"],
        ["n1", N, "Blue"],
      ],
      cfg,
    );
    give(players[0], 100);
    give(players[1], 100);
    give(players[2], 9000);
    expect(checkMineclashWin(game)).toBe(true);
    expect(wins).toEqual([["team", "Blue", "h2"]]);
  });

  it("team over threshold without alive human: no human winner", async () => {
    const { game, players, give, wins } = await make(
      [
        ["h1", H, "Red"],
        ["h2", H, "Blue"],
        ["n1", N, "Blue"],
      ],
      cfg,
    );
    give(players[0], 100);
    give(players[2], 9000); // h2 dead, Blue = nation only
    // Red is the only human side left => Red wins (last human team).
    expect(checkMineclashWin(game)).toBe(true);
    expect(wins).toEqual([["team", "Red", "h1"]]);
  });

  it("humans vs nations: nations over threshold => no human winner", async () => {
    const { game, players, give, wins } = await make(
      [
        ["h1", H, "Humans"],
        ["h2", H, "Humans"],
        ["n1", N, "Nations"],
      ],
      cfg,
    );
    give(players[0], 100);
    give(players[1], 100);
    give(players[2], 9000);
    expect(checkMineclashWin(game)).toBe(true);
    expect(wins).toEqual([["none"]]);
  });

  it("humans vs nations: humans team does not win instantly", async () => {
    const { game, players, give } = await make(
      [
        ["h1", H, "Humans"],
        ["h2", H, "Humans"],
        ["n1", N, "Nations"],
      ],
      cfg,
    );
    give(players[0], 100);
    give(players[1], 100);
    give(players[2], 1000);
    expect(checkMineclashWin(game)).toBe(false);
  });

  it("humans vs nations: min 25, nations lead => no human winner", async () => {
    const { game, players, give, wins, at } = await make(
      [
        ["h1", H, "Humans"],
        ["h2", H, "Humans"],
        ["n1", N, "Nations"],
      ],
      cfg,
    );
    give(players[0], 100);
    give(players[1], 100);
    give(players[2], 3000);
    at(25);
    expect(checkMineclashWin(game)).toBe(true);
    expect(wins).toEqual([["none"]]); // nations lead
  });

  it("humans vs nations: min 25, humans lead => humans win", async () => {
    const { game, players, give, wins, at } = await make(
      [
        ["h1", H, "Humans"],
        ["h2", H, "Humans"],
        ["n1", N, "Nations"],
      ],
      cfg,
    );
    give(players[0], 2000);
    give(players[1], 2000);
    give(players[2], 3000);
    at(25);
    expect(checkMineclashWin(game)).toBe(true);
    expect(wins).toEqual([["team", "Humans", "h1", "h2"]]);
  });
});
