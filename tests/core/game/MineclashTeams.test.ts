import {
  GameMode,
  HumansVsNations,
  PlayerInfo,
  PlayerType,
} from "@openfront/engine-api/game/GameTypes";
import { assignTeams } from "@openfront/engine-lib/game/TeamAssignment";
import { applyMineclashRotationPreset } from "../../../src/server/MineclashPreset";
import { setup } from "../../util/Setup";

const mk = (id: string, clan: string | null, friends: string[] = []) =>
  new PlayerInfo(id, PlayerType.Human, id, id, false, clan, friends);

describe("mineclash random teams", () => {
  const players = ["a", "b", "c", "d"].map((i) => mk(i, "CLAN"));
  const teams = ["Red", "Blue"];

  it("default keeps clan together", () => {
    const r = assignTeams(players, teams, false, 4);
    expect(new Set(r.values()).size).toBe(1);
  });

  it("random ignores clan tags, stays balanced and deterministic", () => {
    const r = assignTeams(players, teams, false, undefined, true);
    const count = (t: string) => [...r.values()].filter((x) => x === t).length;
    expect(count("Red")).toBe(2);
    expect(count("Blue")).toBe(2);
    const r2 = assignTeams(players, teams, false, undefined, true);
    expect([...r2.values()]).toEqual([...r.values()]);
  });

  it("random ignores friends", () => {
    const ps = [mk("a", null, ["b"]), mk("b", null, ["a"])];
    const r = assignTeams(ps, teams, false, 1, true);
    expect(new Set(r.values()).size).toBe(2);
  });

  it("game with preset: same-clan humans are split, nobody kicked", async () => {
    const humans = ["a", "b", "c", "d"].map((i) => mk(i, "CLAN"));
    const game = await setup(
      "plains",
      {
        gameMode: GameMode.Team,
        playerTeams: 2,
        mineclashRules: { endMinutes: 25 },
      },
      humans,
    );
    const teamOf = (id: string) => game.player(id).team();
    const reds = humans.filter((h) => teamOf(h.id) === "Red").length;
    expect(game.allPlayers().filter((p) => p.team() !== null).length).toBe(4);
    expect(reds).toBe(2);
  });
});

describe("rotation preset", () => {
  it("sets rules, no donations, nations on", () => {
    const c = applyMineclashRotationPreset({
      donateGold: true,
      donateTroops: true,
      nations: "disabled",
    } as any);
    expect(c.mineclashRules).toEqual({ endMinutes: 25 });
    expect(c.donateGold).toBe(false);
    expect(c.donateTroops).toBe(false);
    expect(c.nations).toBe("default");
  });

  it("Humans vs Nations is never kept in rotation (replaced by 2 teams)", () => {
    const c = applyMineclashRotationPreset({
      gameMode: GameMode.Team,
      playerTeams: HumansVsNations,
    } as any);
    expect(c.playerTeams).toBe(2);
  });

  it("keeps other team counts and FFA untouched", () => {
    expect(
      applyMineclashRotationPreset({
        gameMode: GameMode.Team,
        playerTeams: 4,
      } as any).playerTeams,
    ).toBe(4);
    expect(
      applyMineclashRotationPreset({ gameMode: GameMode.FFA } as any)
        .playerTeams,
    ).toBeUndefined();
  });

  it("drops overtime and timer so only the preset ends the game", () => {
    const c = applyMineclashRotationPreset({
      overtime: { enabled: true },
      maxTimerValue: 5,
    } as any);
    expect(c.overtime).toBeUndefined();
    expect(c.maxTimerValue).toBeUndefined();
  });
});
