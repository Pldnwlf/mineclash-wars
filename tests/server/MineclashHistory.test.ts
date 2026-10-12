// mineclash #40: Match-Historie schreiben/lesen/aufraeumen.
// @vitest-environment node
import { GameRecord } from "@openfront/shared/WireSchemas";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  cleanupHistory,
  historyResponse,
  readHistory,
  writeHistory,
} from "../../src/server/MineclashHistory";

const U = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [A, B, X] = [U(1), U(2), U(9)];

const rec = (id: string, end: number, winner: unknown = ["player", "cidA"]) =>
  ({
    info: {
      gameID: id,
      end,
      winner,
      config: {
        gameMap: "World",
        gameMode: "Free For All",
        gameType: "Public",
      },
      players: [
        { clientID: "cidA", username: "Alice", persistentID: A },
        { clientID: "cidB", username: "Bob", persistentID: B },
        { clientID: "cidN", username: "NoId", persistentID: null },
      ],
    },
  }) as unknown as GameRecord;

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "mc-history-"));
  vi.stubEnv("MINECLASH_DATA_DIR", dir);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("MineclashHistory", () => {
  test("Eintrag je Teilnehmer, Ergebnis je Spieler, Mitspieler zum Melden", async () => {
    await writeHistory(rec("m1", 1000));
    const [a] = await readHistory(A);
    const [b] = await readHistory(B);
    expect(a).toMatchObject({
      id: "m1",
      map: "World",
      result: "won",
      playerCount: 3,
    });
    expect(a.players).toEqual([{ uuid: B, name: "Bob" }]);
    expect(b.result).toBe("lost");
    expect(await readHistory(X)).toEqual([]);
  });

  test("Team-Sieg, kein Sieger, abgebrochen", async () => {
    await writeHistory(rec("t", 1, ["team", "red", "cidB"]));
    await writeHistory(rec("n", 2, ["none"]));
    await writeHistory(rec("u", 3, null));
    expect((await readHistory(B)).map((e) => e.result)).toEqual([
      "unfinished",
      "none",
      "won",
    ]);
  });

  test("neueste zuerst, Limit, Doppel nur einmal", async () => {
    await writeHistory(rec("old", 1));
    await writeHistory(rec("new", 5));
    await writeHistory(rec("new", 5));
    expect((await readHistory(A)).map((e) => e.id)).toEqual(["new", "old"]);
    expect(await readHistory(A, 1)).toHaveLength(1);
  });

  test("base64url-sub findet die UUID-Datei", async () => {
    await writeHistory(rec("m1", 1));
    const b64 = Buffer.from(A.replace(/-/g, ""), "hex").toString("base64url");
    expect(await readHistory(b64)).toHaveLength(1);
  });

  test("Pfad-Injektion liefert nichts", async () => {
    expect(await readHistory("../reports")).toEqual([]);
  });

  test("Gast 403, Eingeloggter 200 nur mit eigenen", async () => {
    await writeHistory(rec("m1", 1));
    expect((await historyResponse(A, { guest: true })).status).toBe(403);
    const ok = await historyResponse(A, {});
    expect(ok.status).toBe(200);
    expect(ok.body.matches).toHaveLength(1);
    expect((await historyResponse(X, null)).body.matches).toEqual([]);
  });

  test("Aufraeumen: frei 7 Tage, Einsatz 90, leere Dateien weg", async () => {
    const day = 24 * 3600 * 1000;
    const now = 100 * day;
    await writeHistory(rec("old", now - 8 * day));
    await writeHistory(rec("new", now - 1 * day));
    expect(await cleanupHistory(now)).toBe(2); // je Spieler 1
    expect((await readHistory(A)).map((e) => e.id)).toEqual(["new"]);
    expect(await cleanupHistory(now + 30 * day)).toBe(2);
    expect(await fs.readdir(path.join(dir, "history"))).toEqual([]);
  });
});
