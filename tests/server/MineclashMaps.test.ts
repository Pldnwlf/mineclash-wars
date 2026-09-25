import { describe, expect, it, vi } from "vitest";
import { MapPlaylist } from "../../src/server/MapPlaylist";
import { MINECLASH_ROTATION } from "../../src/server/MineclashMaps";

vi.mock("../../src/server/MapLandTiles", () => ({
  getMapLandTiles: async () => 1_000_000,
}));

describe("mineclash rotation pool", () => {
  it("only schedules maps from the pool, all of them eventually", async () => {
    const playlist = new MapPlaylist();
    const seen = new Set();
    for (let i = 0; i < 300; i++) {
      const map = (await playlist.gameConfig("ffa")).gameMap;
      expect(MINECLASH_ROTATION.has(map)).toBe(true);
      seen.add(map);
    }
    expect(seen.size).toBe(MINECLASH_ROTATION.size);
  });
});
