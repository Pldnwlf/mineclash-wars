import { GameMode } from "@openfront/engine-api/game/GameTypes";
import { GameConfigSchema } from "@openfront/engine-api/Schemas";
import { describe, expect, it, vi } from "vitest";
import { MapPlaylist } from "../../src/server/MapPlaylist";

vi.mock("../../src/server/MapLandTiles", () => ({
  getMapLandTiles: async () => 1_000_000,
}));

// mineclash #9: rotation lobbies use the mineclash rules preset (own overtime:
// 80% -> 70% by minute 25), not OpenFront's overtime. Team/special never had it.
describe("MapPlaylist overtime", () => {
  it("FFA lobbies carry the mineclash preset instead of OpenFront overtime", async () => {
    const config = await new MapPlaylist().gameConfig("ffa");
    expect(config.gameMode).toBe(GameMode.FFA);
    expect(config.overtime).toBeUndefined();
    expect(config.mineclashRules).toEqual({ endMinutes: 25 });
    expect(config.donateGold).toBe(false);
    expect(config.donateTroops).toBe(false);
    expect(config.nations).toBe("default");
    expect(GameConfigSchema.safeParse(config).success).toBe(true);
  });

  it.each(["ffa", "team", "special"] as const)(
    "%s lobbies get the preset and never Humans vs Nations",
    async (type) => {
      for (let i = 0; i < 20; i++) {
        const config = await new MapPlaylist().gameConfig(type);
        expect(config.mineclashRules).toEqual({ endMinutes: 25 });
        expect(config.donateGold).toBe(false);
        expect(config.donateTroops).toBe(false);
        expect(config.playerTeams).not.toBe("Humans Vs Nations");
        expect(config.maxTimerValue).toBeUndefined();
      }
    },
  );

  it("never enables overtime in team lobbies", async () => {
    const config = await new MapPlaylist().gameConfig("team");
    expect(config.gameMode).toBe(GameMode.Team);
    expect(config.overtime).toBeUndefined();
  });

  it("never enables overtime in special lobbies", async () => {
    const config = await new MapPlaylist().gameConfig("special");
    expect(config.overtime).toBeUndefined();
  });
});
