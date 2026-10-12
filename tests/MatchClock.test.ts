import type { GameConfig } from "@openfront/engine-api/Schemas";
import {
  endTimerMinutes,
  thresholdText,
} from "../src/client/mineclash/MatchClock";

vi.mock("../src/client/Utils", () => ({
  translateText: (key: string, p?: { percent: number }) =>
    `${key}:${p?.percent}`,
}));

const cfg = (c: Partial<GameConfig>) => c as GameConfig;

describe("MatchClock", () => {
  it("end timer: host timer outside mineclash, min(end, host) inside", () => {
    expect(endTimerMinutes(cfg({}))).toBeUndefined();
    expect(endTimerMinutes(cfg({ maxTimerValue: 7 }))).toBe(7);
    const m = { mineclashRules: { endMinutes: 25 } };
    expect(endTimerMinutes(cfg(m))).toBe(25);
    expect(endTimerMinutes(cfg({ ...m, maxTimerValue: 10 }))).toBe(10);
    expect(endTimerMinutes(cfg({ ...m, maxTimerValue: 40 }))).toBe(25);
  });

  it("threshold text: none outside mineclash, overtime from minute 16", () => {
    expect(thresholdText(cfg({}), 0)).toBeUndefined();
    const c = cfg({ mineclashRules: { endMinutes: 25 } });
    expect(thresholdText(c, 15 * 60)).toBe("mineclash.threshold:80");
    expect(thresholdText(c, 18 * 60)).toBe("mineclash.threshold_overtime:77");
  });
});
