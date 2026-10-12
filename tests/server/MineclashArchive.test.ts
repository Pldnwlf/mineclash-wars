import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GameRecord } from "../../src/core/Schemas";
import {
  cleanupArchive,
  FREE_RETENTION_MS,
  readMatchRecord,
  scrubForPublic,
  writeMatchRecord,
} from "../../src/server/MineclashArchive";

const rec = (id: string) =>
  ({
    info: {
      gameID: id,
      config: { gameMap: "World" },
      players: [{ clientID: "AAAAAAAA", persistentID: "secret" }],
      reports: [{ x: 1 }],
    },
    version: "v0.0.2",
    gitCommit: "a".repeat(40),
    turns: [{ turnNumber: 0, intents: [], hash: 12345 }],
  }) as unknown as GameRecord;

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "mc-archive-"));
  vi.stubEnv("MINECLASH_ARCHIVE_DIR", dir);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("MineclashArchive", () => {
  test("write then read roundtrip, no tmp left", async () => {
    await writeMatchRecord(rec("abcd1234"));
    expect(await readMatchRecord("abcd1234")).toEqual(rec("abcd1234"));
    expect(await fs.readdir(dir)).toEqual(["abcd1234.json.gz"]);
  });

  test("unknown or invalid id gives null", async () => {
    expect(await readMatchRecord("nope1234")).toBeNull();
    expect(await readMatchRecord("../etc/passwd")).toBeNull();
  });

  test("scrubForPublic drops persistentID and reports", () => {
    const out = scrubForPublic(rec("abcd1234")) as GameRecord;
    expect(out.info.players[0].persistentID).toBeNull();
    expect(out.info.reports).toBeUndefined();
  });

  test("cleanup removes records older than 7 days only", async () => {
    await writeMatchRecord(rec("oldold12"));
    await writeMatchRecord(rec("newnew12"));
    const old = new Date(Date.now() - FREE_RETENTION_MS - 60_000);
    await fs.utimes(path.join(dir, "oldold12.json.gz"), old, old);
    expect(await cleanupArchive()).toBe(1);
    expect(await fs.readdir(dir)).toEqual(["newnew12.json.gz"]);
  });

  test("stake files live 90 days", async () => {
    const f = path.join(dir, "stake123.stake.json.gz");
    await fs.writeFile(f, "x");
    const t = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    await fs.utimes(f, t, t);
    expect(await cleanupArchive()).toBe(0);
    expect(await cleanupArchive(Date.now() + 70 * 24 * 3600 * 1000)).toBe(1);
  });
});
