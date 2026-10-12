import { describe, expect, it } from "vitest";
import {
  activeLobbyIDs,
  formatUsd,
  GLOW_CLASS,
  glowClass,
  joinedFromEvent,
  pickFreeLobby,
  pickStakeLobby,
  ringFraction,
  syncJoined,
  toggleJoin,
} from "../../src/client/mineclash/menu/MenuLogic";

const g = (gameID: string) => ({ gameID }) as any;

describe("menu toggle / glow", () => {
  it("first click joins, second click leaves", () => {
    const a = toggleJoin(null, "A");
    expect(a).toEqual({ action: "join", joined: "A" });
    expect(toggleJoin(a.joined, "A")).toEqual({
      action: "leave",
      joined: null,
    });
  });
  it("click on the other card switches", () => {
    expect(toggleJoin("A", "B")).toEqual({ action: "join", joined: "B" });
  });
  it("glows only when joined", () => {
    expect(glowClass(true)).toBe(GLOW_CLASS);
    expect(glowClass(false)).not.toContain("cyber-yellow");
  });
  it("drops the join when the lobby leaves the feed", () => {
    expect(syncJoined("A", ["A", "B"])).toBe("A");
    expect(syncJoined("A", ["B"])).toBeNull();
    expect(syncJoined(null, ["B"])).toBeNull();
  });
  it("events: only public joins count", () => {
    expect(joinedFromEvent("public", "A")).toBe("A");
    expect(joinedFromEvent("private", "A")).toBeNull();
    expect(joinedFromEvent(undefined, "A")).toBeNull();
  });
});

describe("menu data", () => {
  it("picks one free lobby, no stake lobby yet", () => {
    const games = { ffa: [g("F")], team: [g("T")] } as any;
    expect(pickFreeLobby(games)?.gameID).toBe("F");
    expect(pickFreeLobby({ team: [g("T")] } as any)?.gameID).toBe("T");
    expect(pickFreeLobby({} as any)).toBeNull();
    expect(pickStakeLobby(games)).toBeNull();
    expect(activeLobbyIDs(games)).toEqual(["F", "T"]);
  });
  it("ring and usd", () => {
    expect(ringFraction(15, 30)).toBe(0.5);
    expect(ringFraction(-1, 30)).toBe(0);
    expect(ringFraction(5, 0)).toBe(0);
    expect(formatUsd(100, 1000)).toBe("$100K");
    expect(formatUsd(1, 500)).toBe("$500");
    expect(formatUsd(100, null)).toBe("");
  });
});
