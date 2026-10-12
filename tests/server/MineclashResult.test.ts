// mineclash #39: Ergebnis-File (pending -> paid/refunded) + Historie-Merge.
// @vitest-environment node
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { createStub, uuidForName } from "../../scripts/mineclash-api-stub";
import { MineclashApiClient } from "../../src/server/mineclash/MineclashApi";
import {
  expectedPayouts,
  readResult,
} from "../../src/server/mineclash/MineclashResultStore";
import { MineclashWallet } from "../../src/server/mineclash/MineclashWallet";
import { withPayout } from "../../src/server/MineclashHistory";
import type { MineclashResult } from "../../src/server/MineclashVerify";

let base = "";
let stub: Awaited<ReturnType<typeof createStub>>;
let root: string;
let wallet: MineclashWallet;
let n = 0;
let U: string[] = [];
const uuidOf = (c: string) => U["abc".indexOf(c[1])];
const winners = (...c: string[]): MineclashResult => ({
  kind: "winners",
  clientIds: c,
});

beforeAll(async () => {
  stub = await createStub({
    issuer: "http://stub.test",
    apiKey: "k",
    startCoins: 1000,
  });
  await new Promise<void>((r) => stub.server.listen(0, r));
  base = `http://localhost:${(stub.server.address() as AddressInfo).port}`;
});
afterAll(() => stub.server.close());
beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), "res39-"));
  vi.stubEnv("MINECLASH_DATA_DIR", root);
  U = ["a", "b", "c"].map((x) => uuidForName(`${x}${++n}`));
  wallet = new MineclashWallet({
    api: new MineclashApiClient(base, "k"),
    serverId: "s39",
    dir: path.join(root, "settles"),
    backoff: [5, 20],
    masterPid: process.pid,
  });
  await wallet.start();
});
afterEach(() => {
  wallet.stop();
  vi.unstubAllEnvs();
});

const resDir = () => path.join(root, "results");

describe("Ergebnis-File", () => {
  test("pending beim Eintreffen, paid nach Settle mit Betraegen", async () => {
    const m = `p${++n}`;
    await wallet.hold(m, U[0], 100);
    await wallet.hold(m, U[1], 100);
    // Wallet down: Settle bleibt offen -> pending
    const real = wallet["o"].api.settle.bind(wallet["o"].api);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    wallet["o"].api.settle = async (r) => (await gate, real(r));
    await wallet.settle(m, winners("ca"), wallet.stakesOf(m), uuidOf);
    expect(await readResult(m, resDir())).toEqual({
      status: "pending",
      stakeCoins: 100,
      potCoins: 200,
    });
    release();
    await wallet.settled(m);
    expect(await readResult(m, resDir())).toEqual({
      status: "paid",
      stakeCoins: 100,
      potCoins: 200,
      rakeCoins: 10,
      payouts: [{ uuid: U[0], coins: 190 }],
    });
  });

  test("Gleichstand mit Rundungsrest", async () => {
    const m = `t${++n}`;
    for (const u of U) await wallet.hold(m, u, 7); // 21, Rake 1, 20/3=6 je
    await wallet.settle(
      m,
      winners("ca", "cb", "cc"),
      wallet.stakesOf(m),
      uuidOf,
    );
    await wallet.settled(m);
    const r = await readResult(m, resDir());
    expect(r.status).toBe("paid");
    expect(r.rakeCoins).toBe(1);
    expect(r.payouts?.map((p) => p.coins)).toEqual([6, 6, 6]);
    expect(
      expectedPayouts(
        21,
        U.map((uuid) => ({ uuid, parts: 1 })),
      ).rake,
    ).toBe(1);
  });

  test("refund mit Grund, keine Rake", async () => {
    const m = `r${++n}`;
    await wallet.hold(m, U[0], 50);
    await wallet.hold(m, U[1], 50);
    await wallet.settle(
      m,
      { kind: "refund", reason: "no_human_winner" },
      wallet.stakesOf(m),
      uuidOf,
    );
    await wallet.settled(m);
    const r = await readResult(m, resDir());
    expect(r).toMatchObject({
      status: "refunded",
      reason: "nations_won",
      potCoins: 100,
      rakeCoins: 0,
      stakeCoins: 50,
    });
  });

  test("unbekannte/boese ID => none", async () => {
    expect(await readResult("../x", resDir())).toEqual({ status: "none" });
    expect(await readResult("nix", resDir())).toEqual({ status: "none" });
  });

  test("Historie: netCoins/stakeCoins/payoutStatus aus dem Ergebnis", async () => {
    const m = `h${++n}`;
    await wallet.hold(m, U[0], 100);
    await wallet.hold(m, U[1], 100);
    await wallet.settle(m, winners("ca"), wallet.stakesOf(m), uuidOf);
    await wallet.settled(m);
    const e = (stake = true) =>
      ({ id: m, stake }) as unknown as Parameters<typeof withPayout>[0];
    expect(withPayout(e(), U[0])).toMatchObject({
      stakeCoins: 100,
      netCoins: 90,
      payoutStatus: "paid",
    });
    expect(withPayout(e(), U[1])).toMatchObject({ netCoins: -100 });
    expect(withPayout(e(false), U[0]).payoutStatus).toBeUndefined();
  });
});
