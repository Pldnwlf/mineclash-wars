// mineclash #44: Vertrag + Ledger-Invarianten gegen den lokalen API-Stub.
// @vitest-environment node
import { createLocalJWKSet, jwtVerify } from "jose";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createStub, uuidForName } from "../../scripts/mineclash-api-stub";
import { UserMeResponseSchema } from "@openfront/shared/ApiSchemas";
import { base64urlToUuid } from "@openfront/shared/Base64";
import {
  HOLD_TTL_MS,
  MineclashApiClient,
  MineclashApiError,
} from "../../src/server/mineclash/MineclashApi";

const KEY = "k";
const [A, B, C, D] = ["a", "b", "c", "d"].map(uuidForName);
let t = 1_700_000_000_000;
let base = "";
let api: MineclashApiClient;
let stub: Awaited<ReturnType<typeof createStub>>;

beforeAll(async () => {
  stub = await createStub({
    issuer: "http://stub.test",
    audience: "localhost",
    apiKey: KEY,
    now: () => t,
    startCoins: 1000,
  });
  await new Promise<void>((r) => stub.server.listen(0, r));
  base = `http://localhost:${(stub.server.address() as AddressInfo).port}`;
  api = new MineclashApiClient(base, KEY);
});
afterAll(() => {
  stub.server.close();
});

const hold = (m: string, uuid: string, coins = 100, server_id = "s1") =>
  api.hold({ match_id: m, uuid, coins, server_id });
const win = (m: string, ...w: string[]) =>
  api.settle({
    event_id: m,
    match_id: m,
    outcome: {
      kind: "winners",
      winners: w.map((uuid) => ({ uuid, parts: 1 })),
    },
  });
const touch = () => Promise.all([A, B, C, D].map((u) => api.balance(u)));
const code = (p: Promise<unknown>) =>
  p.then(
    () => "ok",
    (e) => (e as MineclashApiError).code,
  );

describe("auth", () => {
  test("JWT verifiziert gegen JWKS, sub = base64url-UUID, /users/@me gültig", async () => {
    const login = await (await fetch(`${base}/dev/login?name=Alice`)).json();
    const jwks = await (await fetch(`${base}/.well-known/jwks.json`)).json();
    const { payload } = await jwtVerify(login.token, createLocalJWKSet(jwks), {
      algorithms: ["EdDSA"],
      issuer: "http://stub.test",
      audience: "localhost",
    });
    expect(base64urlToUuid(payload.sub!)).toBe(login.uuid);
    expect(payload.name).toBe("Alice");
    const me = await fetch(`${base}/users/@me`, {
      headers: { authorization: `Bearer ${login.token}`, "x-api-key": KEY },
    });
    expect(UserMeResponseSchema.safeParse(await me.json()).success).toBe(true);
    const bad = await fetch(`${base}/users/@me`, {
      headers: { authorization: `Bearer ${login.token}` },
    });
    expect(bad.status).toBe(401);
  });

  test("Gast-JWT", async () => {
    const g = await (
      await fetch(`${base}/auth/guest`, { method: "POST" })
    ).json();
    expect(g.token.split(".")).toHaveLength(3);
  });

  test("Wallet ohne Secret abgelehnt", async () => {
    expect(await code(new MineclashApiClient(base, "x").rate())).toBe(
      "bad_api_key",
    );
  });
});

describe("wallet", () => {
  test("Rate", async () => {
    expect((await api.rate()).wd_per_coin).toBe(1000);
  });

  test("Hold idempotent, Konflikt, zu wenig Guthaben, release", async () => {
    expect((await hold("m1", A)).replayed).toBe(false);
    expect((await hold("m1", A)).replayed).toBe(true);
    expect(await code(hold("m1", A, 50))).toBe("hold_conflict");
    expect(await code(hold("m2", A, 901))).toBe("insufficient_funds");
    expect((await api.balance(A)).available).toBe(900);
    expect((await api.release({ match_id: "m1", uuid: A })).released).toBe(
      true,
    );
    expect((await api.release({ match_id: "m1", uuid: A })).released).toBe(
      false,
    );
    expect((await api.balance(A)).available).toBe(1000);
  });

  test("Settle + Doppel-Settle: Rake verbrannt, Summe bleibt bis auf Rake", async () => {
    await touch();
    const before = stub.ledger.total();
    await hold("m3", A);
    await hold("m3", B);
    const r = await win("m3", A);
    expect(r).toMatchObject({ pot: 200, burned: 10, replayed: false });
    expect(r.payouts).toEqual([{ uuid: A, coins: 190 }]);
    expect(await win("m3", A)).toMatchObject({ replayed: true, burned: 10 });
    expect(await code(win("m3", B))).toBe("settle_conflict");
    expect((await api.balance(A)).balance).toBe(1090);
    expect((await api.balance(B)).balance).toBe(900);
    expect(stub.ledger.total()).toBe(before - 10);
    expect(await code(hold("m3", C))).toBe("match_settled");
  });

  test("Gleichstand mit Rundungsrest wird mitverbrannt", async () => {
    await touch();
    const before = stub.ledger.total();
    for (const u of [A, B, C]) await hold("m5", u, 101); // Topf 303, Rake 15
    const r2 = await win("m5", A, B);
    expect(r2.payouts.map((p) => p.coins)).toEqual([144, 144]); // 288/2
    expect(r2.burned).toBe(15);
    for (const u of [A, B, C]) await hold("m6", u, 7); // 21, Rake 1, 20/3=6
    const r3 = await win("m6", A, B, C);
    expect(r3.payouts.map((p) => p.coins)).toEqual([6, 6, 6]);
    expect(r3.burned).toBe(3); // Rake 1 + Rest 2
    expect(stub.ledger.total()).toBe(before - 15 - 3);
  });

  test("Refund: alles zurück, keine Rake; Nicht-Hold kann nicht gewinnen", async () => {
    await touch();
    const before = stub.ledger.total();
    await hold("m7", A);
    await hold("m7", B);
    const r = await api.settle({
      event_id: "m7",
      match_id: "m7",
      outcome: { kind: "refund", reason: "nations_won" },
    });
    expect(r).toMatchObject({ kind: "refund", burned: 0, pot: 200 });
    expect(stub.ledger.total()).toBe(before);
    expect((await api.balance(A)).held).toBe(0);
    await hold("m8", A);
    expect(await code(win("m8", D))).toBe("winner_not_held");
  });

  test("Ablauf nach 1 h, Heartbeat verlängert", async () => {
    await hold("m9", A, 100, "s9");
    await hold("m10", B, 100, "s9");
    t += HOLD_TTL_MS - 1000;
    await api.heartbeat({ server_id: "s9", match_ids: ["m9"] });
    t += 2000;
    expect((await api.balance(A)).held).toBe(100); // m9 (m8 abgelaufen)
    expect((await api.balance(B)).held).toBe(0); // m10 abgelaufen
    expect(await code(win("m10", B))).toBe("winner_not_held");
  });

  test("Server-Start gibt Holds frei, ausser offene Settles (#42)", async () => {
    await hold("m11", C, 100, "s11");
    await hold("m12", B, 100, "s11");
    await hold("m13", D, 100, "other");
    const r = await api.serverStart({
      server_id: "s11",
      open_settle_match_ids: ["m12"],
    });
    expect(r.released).toBe(1);
    expect((await api.balance(C)).held).toBe(0);
    expect((await api.balance(B)).held).toBe(100);
    expect((await api.balance(D)).held).toBe(100);
    expect((await win("m12", B)).payouts).toEqual([{ uuid: B, coins: 95 }]);
  });
});
