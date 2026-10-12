// mineclash #28: Reports speichern, Nach-Match-Report, Rate-Limit, Doppel.
// @vitest-environment node
import { GameType } from "@openfront/engine-api/game/GameTypes";
import { promises as fs } from "fs";
import type { AddressInfo } from "node:net";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createStub } from "../../scripts/mineclash-api-stub";
import { MineclashApiClient } from "../../src/server/mineclash/MineclashApi";
import {
  postMatchReport,
  readReports,
  REPORT_LIMIT_PER_HOUR,
  submitReport,
} from "../../src/server/MineclashReports";
import {
  cid,
  makeClient,
  makeGame,
  mockWsOf,
  startGame,
} from "../util/GameServerHarness";

const U = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [A, B, C, X] = [U(1), U(2), U(3), U(9)];

const base = {
  match_id: "m1",
  reporter: A,
  reported: B,
  reason: "teaming" as const,
  tick: 120,
  source: "match" as const,
};

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "mc-reports-"));
  vi.stubEnv("MINECLASH_DATA_DIR", dir);
  vi.stubEnv("MINECLASH_API_URL", "");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("submitReport", () => {
  test("speichert alle Felder dauerhaft", async () => {
    expect(await submitReport({ ...base, note: "x" }, 5000)).toBe("ok");
    expect(await readReports()).toEqual([{ ...base, note: "x", ts: 5000 }]);
  });

  test("Doppel-Report je (Match, Melder, Gemeldeter) wird abgelehnt", async () => {
    await submitReport(base);
    expect(await submitReport({ ...base, reason: "griefing" })).toBe(
      "duplicate",
    );
    expect(await submitReport({ ...base, match_id: "m2" })).toBe("ok");
    expect(await submitReport({ ...base, reported: C })).toBe("ok");
    expect(await readReports()).toHaveLength(3);
  });

  test("Rate-Limit: 10 pro Stunde je Melder", async () => {
    const t = 1_000_000;
    for (let i = 0; i < REPORT_LIMIT_PER_HOUR; i++)
      expect(await submitReport({ ...base, match_id: `m${i}` }, t)).toBe("ok");
    expect(await submitReport({ ...base, match_id: "mx" }, t + 1000)).toBe(
      "rate_limited",
    );
    expect(
      await submitReport({ ...base, reporter: C, match_id: "mx" }, t),
    ).toBe("ok");
    expect(
      await submitReport({ ...base, match_id: "mx" }, t + 3600 * 1000 + 1),
    ).toBe("ok");
  });

  test("leitet an die API weiter (POST /reports im Stub)", async () => {
    const stub = await createStub({ issuer: "http://s", apiKey: "k" });
    await new Promise<void>((r) => stub.server.listen(0, r));
    const url = `http://localhost:${(stub.server.address() as AddressInfo).port}`;
    vi.stubEnv("MINECLASH_API_URL", url);
    vi.stubEnv("API_KEY", "k");
    await submitReport(base, 7);
    await vi.waitFor(() => expect(stub.ledger.reports).toHaveLength(1));
    expect(stub.ledger.reports[0]).toMatchObject({ reporter: A, reported: B });
    // Vertrag: idempotent
    await new MineclashApiClient(url, "k").report({ ...base, ts: 7 });
    expect(stub.ledger.reports).toHaveLength(1);
    stub.server.close();
  });
});

describe("postMatchReport", () => {
  const record = {
    info: {
      gameID: "m1",
      num_turns: 500,
      players: [A, B, C].map((p) => ({ persistentID: p })),
    },
  };
  const body = { reported: [B], reason: "teaming", tick: 100 };

  test("Teilnehmer meldet Teilnehmer: gespeichert als post_match", async () => {
    const r = await postMatchReport(record, A, body);
    expect(r.status).toBe(200);
    expect(await readReports()).toMatchObject([
      {
        match_id: "m1",
        reporter: A,
        reported: B,
        tick: 100,
        source: "post_match",
      },
    ]);
  });

  test("Nicht-Teilnehmer: 403, nichts gespeichert", async () => {
    expect((await postMatchReport(record, X, body)).status).toBe(403);
    expect(await readReports()).toEqual([]);
  });

  test("Ziel kein Teilnehmer / selbst / Tick zu gross / Muell: 400", async () => {
    const st = async (b: object) =>
      (await postMatchReport(record, A, b)).status;
    expect(await st({ ...body, reported: [X] })).toBe(400);
    expect(await st({ ...body, reported: [A] })).toBe(400);
    expect(await st({ ...body, tick: 501 })).toBe(400);
    expect(await st({ reason: "nope" })).toBe(400);
  });

  test("Doppel: 409; Rate-Limit: 429", async () => {
    await postMatchReport(record, A, body);
    expect((await postMatchReport(record, A, body)).status).toBe(409);
    for (let i = 0; i < REPORT_LIMIT_PER_HOUR; i++)
      await submitReport({ ...base, match_id: `o${i}` });
    expect(
      (await postMatchReport(record, A, { ...body, reported: [C] })).status,
    ).toBe(429);
  });
});

describe("Report im Match", () => {
  test("GameServer speichert mit UUIDs und Tick", async () => {
    const storeReport = vi.fn(async () => "ok");
    const game = makeGame({
      config: { gameType: GameType.Public, maxPlayers: 2 },
      deps: { storeReport },
    });
    const alice = makeClient({ clientID: cid("alice"), persistentID: A });
    const bob = makeClient({ clientID: cid("bob"), persistentID: B });
    game.joinClient(alice);
    game.joinClient(bob);
    startGame(game);
    await mockWsOf(alice).emit({
      type: "report",
      reported: cid("bob"),
      reason: "teaming",
    });
    expect(storeReport).toHaveBeenCalledWith({
      match_id: game.id,
      reporter: A,
      reported: B,
      reason: "teaming",
      tick: expect.any(Number),
      source: "match",
    });
  });
});
