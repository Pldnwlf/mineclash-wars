// mineclash #22/#25/#42: Wallet-Schicht gegen den echten API-Stub (HTTP).
// @vitest-environment node
import { mkdtempSync, readdirSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { createStub, uuidForName } from "../../scripts/mineclash-api-stub";
import {
  MineclashApiClient,
  MineclashApiError,
} from "../../src/server/mineclash/MineclashApi";
import {
  buildSettleRequest,
  hasOpenSettleFiles,
  MineclashWallet,
  stakeOf,
} from "../../src/server/mineclash/MineclashWallet";
import type { MineclashResult } from "../../src/server/MineclashVerify";

const KEY = "k";
// frische Konten je Test (der Stub teilt sich den Ledger)
let [A, B, C, D] = ["", "", "", ""];
let CLIENT: Record<string, string> = {};
const uuidOf = (c: string) => CLIENT[c];

let base = "";
let down = false;
let stub: Awaited<ReturnType<typeof createStub>>;
let dir: string;
let seq = 0;
const wallets: MineclashWallet[] = [];

const flaky: typeof fetch = (...a) =>
  down ? Promise.reject(new TypeError("fetch failed")) : fetch(...a);

function mk(serverId = "s1", masterPid = process.pid) {
  const w = new MineclashWallet({
    api: new MineclashApiClient(base, KEY, flaky),
    serverId,
    dir,
    backoff: [5, 20],
    sweepMs: 20,
    heartbeatMs: 1000,
    masterPid,
  });
  wallets.push(w);
  return w;
}
const mid = () => `w${++seq}`;
const winners = (...c: string[]): MineclashResult => ({
  kind: "winners",
  clientIds: c,
});
const bal = (u: string) => stub.ledger.balance(u);
const until = async (f: () => boolean) => {
  for (let i = 0; i < 400 && !f(); i++)
    await new Promise((r) => setTimeout(r, 10));
  expect(f()).toBe(true);
};
const files = () => readdirSync(dir).filter((f) => f.endsWith(".json"));

beforeAll(async () => {
  stub = await createStub({
    issuer: "http://stub.test",
    apiKey: KEY,
    startCoins: 1000,
  });
  await new Promise<void>((r) => stub.server.listen(0, r));
  base = `http://localhost:${(stub.server.address() as AddressInfo).port}`;
});
afterAll(() => {
  wallets.forEach((w) => w.stop());
  stub.server.close();
});
beforeEach(() => {
  down = false;
  dir = mkdtempSync(path.join(tmpdir(), "settles-"));
  [A, B, C, D] = ["a", "b", "c", "d"].map((n) => uuidForName(`${n}${++seq}`));
  CLIENT = { ca: A, cb: B, cc: C, cd: D };
  for (const u of [A, B, C, D]) bal(u);
});

async function ready(w = mk()) {
  await w.start();
  return w;
}

describe("Auszahlung", () => {
  test("normal: Gewinner bekommt Topf - 5 %, Summe bis auf Rake gleich, Datei weg", async () => {
    const w = await ready();
    const m = mid();
    const before = stub.ledger.total();
    await w.hold(m, A, 100);
    await w.hold(m, B, 100);
    await w.settle(m, winners("ca"), w.stakesOf(m), uuidOf);
    await w.settled(m);
    expect(bal(A).balance).toBe(1090);
    expect(bal(B).balance).toBe(900);
    expect(stub.ledger.total()).toBe(before - 10);
    expect(files()).toEqual([]);
    expect(hasOpenSettleFiles(dir)).toBe(false);
  });

  test("nicht gespawnt: Einsatz zurueck, nicht im Topf", async () => {
    const w = await ready();
    const m = mid();
    for (const u of [A, B, C]) await w.hold(m, u, 100);
    const res: MineclashResult = {
      kind: "winners",
      clientIds: ["ca"],
      notSpawned: ["cc"],
    };
    await w.settle(m, res, w.stakesOf(m), uuidOf);
    await w.settled(m);
    expect([A, B, C].map((u) => bal(u).balance)).toEqual([1090, 900, 1000]);
    expect(bal(C).held).toBe(0);
    expect(files()).toEqual([]);
  });

  test("Gleichstand mit Rundungsrest: Rest wird mitverbrannt", async () => {
    const w = await ready();
    const m = mid();
    const before = stub.ledger.total();
    for (const u of [A, B, C]) await w.hold(m, u, 7); // 21, Rake 1, 20/3=6
    await w.settle(m, winners("ca", "cb", "cc"), w.stakesOf(m), uuidOf);
    await w.settled(m);
    expect([A, B, C].map((u) => bal(u).balance)).toEqual([999, 999, 999]);
    expect(stub.ledger.total()).toBe(before - 3);
  });

  test("Team: Gewinnerteam teilt gleichmaessig, doppelte Clients nur einmal", async () => {
    const w = await ready();
    const m = mid();
    for (const u of [A, B, C, D]) await w.hold(m, u, 100); // 400, Rake 20
    await w.settle(
      m,
      { kind: "winners", clientIds: ["ca", "cb", "ca"], team: "red" },
      w.stakesOf(m),
      uuidOf,
    );
    await w.settled(m);
    expect(bal(A).balance).toBe(1000 - 100 + 190);
    expect(bal(B).balance).toBe(1000 - 100 + 190);
    expect(bal(C).balance).toBe(900);
    expect(bal(D).balance).toBe(900);
  });

  test.each([
    ["no_human_winner", "nations_won"],
    ["too_few_humans", "too_few_humans"],
    ["mismatch", "recount_mismatch"],
    ["error", "recount_mismatch"],
    ["aborted", "aborted"],
  ] as const)("refund %s ohne Rake", async (reason, apiReason) => {
    const w = await ready();
    const m = mid();
    const before = stub.ledger.total();
    await w.hold(m, A, 100);
    await w.hold(m, B, 100);
    expect(
      buildSettleRequest(m, { kind: "refund", reason }, {}, uuidOf).request
        .outcome,
    ).toEqual({ kind: "refund", reason: apiReason });
    await w.settle(m, { kind: "refund", reason }, w.stakesOf(m), uuidOf);
    await w.settled(m);
    expect(bal(A)).toMatchObject({ balance: 1000, held: 0 });
    expect(bal(B)).toMatchObject({ balance: 1000, held: 0 });
    expect(stub.ledger.total()).toBe(before);
  });

  test("Gewinner ohne Hold bekommt nie Geld: Rueckzahlung", async () => {
    const w = await ready();
    const m = mid();
    await w.hold(m, A, 100);
    await w.hold(m, B, 100);
    await w.settle(m, winners("ca", "cc"), w.stakesOf(m), uuidOf); // C ohne Hold
    await w.settled(m);
    expect(bal(A)).toMatchObject({ balance: 1000, held: 0 });
    expect(bal(B)).toMatchObject({ balance: 1000, held: 0 });
    expect(bal(C).balance).toBe(1000);
    const m2 = mid(); // unbekannter Client
    await w.hold(m2, A, 100);
    await w.settle(m2, winners("zz"), w.stakesOf(m2), uuidOf);
    await w.settled(m2);
    expect(bal(A)).toMatchObject({ balance: 1000, held: 0 });
  });

  test("Doppel-Settle harmlos: zweiter Aufruf aendert keine Kontostaende", async () => {
    const w = await ready();
    const m = mid();
    await w.hold(m, A, 100);
    await w.hold(m, B, 100);
    await w.settle(m, winners("ca"), w.stakesOf(m), uuidOf);
    await w.settled(m);
    const total = stub.ledger.total();
    // Replay mit identischem Inhalt (Absturz zwischen Erfolg und Datei-Loeschen)
    const api = new MineclashApiClient(base, KEY);
    const again = await api.settle(
      buildSettleRequest(m, winners("ca"), { [A]: 100, [B]: 100 }, uuidOf)
        .request,
    );
    expect(again.replayed).toBe(true);
    expect(stub.ledger.total()).toBe(total);
    expect(bal(A).balance).toBe(1090);
    expect(bal(B).balance).toBe(900);
  });
});

describe("Ausfall (#42)", () => {
  test("Wallet down waehrend Settle => nach Wiederkehr ausgezahlt", async () => {
    const w = await ready();
    const m = mid();
    await w.hold(m, A, 100);
    await w.hold(m, B, 100);
    down = true;
    await w.settle(m, winners("ca"), w.stakesOf(m), uuidOf);
    expect(files()).toEqual([`${m}.json`]);
    expect(hasOpenSettleFiles(dir)).toBe(true);
    await new Promise((r) => setTimeout(r, 60));
    expect(bal(A).balance).toBe(1000);
    down = false;
    await until(() => !hasOpenSettleFiles(dir));
    expect(bal(A).balance).toBe(1090);
    expect(bal(B).balance).toBe(900);
  });

  test("Neustart direkt nach Matchende (Wallet down) => ausgezahlt, nicht zurueckgezahlt", async () => {
    const w1 = mk("srv-x");
    await w1.start();
    const m = mid();
    const other = mid(); // laufendes Match ohne Settle
    await w1.hold(m, A, 100);
    await w1.hold(m, B, 100);
    await w1.hold(other, C, 50);
    down = true;
    await w1.settle(m, winners("ca"), w1.stakesOf(m), uuidOf);
    w1.stop(); // Prozess stirbt
    down = false;
    const w2 = mk("srv-x"); // neuer Prozess, gleiches Volume
    await w2.start();
    expect(bal(C).held).toBe(0); // other freigegeben
    await until(() => !hasOpenSettleFiles(dir));
    expect(bal(A).balance).toBe(1090); // m nicht freigegeben, sondern ausgezahlt
    expect(bal(B).balance).toBe(900);
  });

  test("Start wartet auf die Wallet, Holds davor werden abgelehnt", async () => {
    down = true;
    const w = mk();
    const started = w.start();
    await expect(w.hold(mid(), A, 10)).rejects.toBeInstanceOf(
      MineclashApiError,
    );
    await new Promise((r) => setTimeout(r, 40));
    down = false;
    await started;
    await w.hold(mid(), A, 10);
  });

  test("Worker: Hold erst, wenn der Master serverStart geschafft hat", async () => {
    const worker = mk();
    expect(worker.isReady()).toBe(false);
    await expect(worker.hold(mid(), A, 10)).rejects.toMatchObject({
      code: "wallet_not_ready",
    });
    down = true;
    const master = mk();
    const started = master.start(); // blockiert nur diesen Aufruf
    await new Promise((r) => setTimeout(r, 30));
    expect(worker.isReady()).toBe(false);
    down = false;
    await started;
    expect(worker.isReady()).toBe(true);
    // Datei eines anderen (frueheren) Masters zaehlt nicht
    expect(mk("s1", process.pid + 1).isReady()).toBe(false);
    await worker.hold(mid(), A, 10);
  });

  test("Datei eines toten Workers wird vom Master nachgeholt", async () => {
    await ready();
    const worker = mk();
    worker.startWorker();
    const m = mid();
    await worker.hold(m, A, 100);
    await worker.hold(m, B, 100);
    down = true;
    await worker.settle(m, winners("cb"), worker.stakesOf(m), uuidOf);
    worker.stop(); // Worker stirbt
    down = false;
    expect(files()).toEqual([`${m}.json`]);
    await until(() => !hasOpenSettleFiles(dir));
    expect(bal(B).balance).toBe(1090);
  });
});

describe("Holds", () => {
  test("release/releaseAll idempotent", async () => {
    const w = await ready();
    const m = mid();
    await w.hold(m, A, 100);
    await w.hold(m, B, 100);
    await w.release(m, A);
    await w.release(m, A);
    expect(bal(A).held).toBe(0);
    await w.releaseAll(m);
    await w.releaseAll(m);
    expect(bal(B).held).toBe(0);
  });
});

describe("stakeOf", () => {
  test("liest mineclashStake", () => {
    expect(stakeOf({})).toBeUndefined();
    expect(stakeOf({ mineclashStake: { coins: 15 } })).toBe(15);
  });
});
