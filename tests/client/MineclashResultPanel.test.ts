// mineclash #39: Endscreen-Panel (Texte je Grund, Polling-Statuswechsel).
import { afterEach, describe, expect, it, vi } from "vitest";
import de from "../../resources/lang/de.json";
import en from "../../resources/lang/en.json";
import {
  describeResult,
  MineclashResult,
  POLL_MS,
  reasonKey,
  type ResultBody,
} from "../../src/client/mineclash/ResultPanel";

const ME = "me";

describe("describeResult", () => {
  it("offen: pending, kein Gewinn", () => {
    const v = describeResult({ status: "pending", potCoins: 200 }, ME, 100);
    expect(v).toMatchObject({ final: false, net: null, stake: 100, pot: 200 });
    expect(describeResult(null, ME, 100).statusKey).toBe(
      "mineclash.result_pending",
    );
  });
  it("Gewinner / Verlierer", () => {
    const body: ResultBody = {
      status: "paid",
      stakeCoins: 100,
      potCoins: 200,
      rakeCoins: 10,
      payouts: [{ uuid: ME, coins: 190 }],
    };
    expect(describeResult(body, ME, 100)).toMatchObject({
      net: 90,
      share: null,
    });
    expect(describeResult(body, "other", 100).net).toBe(-100);
  });
  it("Gleichstand: Anteil pro Person", () => {
    const body: ResultBody = {
      status: "paid",
      stakeCoins: 7,
      potCoins: 21,
      rakeCoins: 1,
      payouts: [
        { uuid: ME, coins: 6 },
        { uuid: "x", coins: 6 },
        { uuid: "y", coins: 6 },
      ],
    };
    expect(describeResult(body, ME, 7)).toMatchObject({ net: -1, share: 6 });
  });
  it("refund: netto 0 + Grund", () => {
    const v = describeResult(
      { status: "refunded", reason: "too_few_humans", potCoins: 100 },
      ME,
      50,
    );
    expect(v).toMatchObject({
      final: true,
      net: 0,
      statusKey: "mineclash.result_refunded",
      reasonKey: "mineclash.result_reason_too_few_humans",
    });
  });
  it("jeder Grund hat einen Text in en und de", () => {
    for (const r of [
      "no_human_winner",
      "nations_won",
      "too_few_humans",
      "mismatch",
      "error",
      "recount_mismatch",
      "aborted",
      undefined,
    ]) {
      const k = reasonKey(r).replace("mineclash.", "");
      expect((en.mineclash as any)[k]).toBeTruthy();
      expect((de.mineclash as any)[k]).toBeTruthy();
    }
  });
});

describe("Polling", () => {
  afterEach(() => vi.useRealTimers());
  it("pending -> paid, danach kein weiterer Abruf", async () => {
    vi.useFakeTimers();
    const seq: ResultBody[] = [
      { status: "none" },
      { status: "pending" },
      { status: "paid", payouts: [] },
    ];
    const fetcher = vi.fn(async () => seq.shift() ?? null);
    const el = new MineclashResult();
    el.fetcher = fetcher;
    el.gameID = "g1";
    el.stakeCoins = 10;
    el.myUuid = ME;
    await el.poll();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(fetcher).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
