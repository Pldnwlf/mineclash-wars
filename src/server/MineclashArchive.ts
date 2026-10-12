// mineclash #29: eigene Replay-Ablage (statt closed-source API). Eine
// gzip-JSON-Datei pro Match in MINECLASH_ARCHIVE_DIR.
import { promises as fs } from "fs";
import path from "path";
import { gunzipSync, gzipSync } from "zlib";
import { GameID, GameRecord, ID } from "../core/Schemas";
import { replacer } from "../core/Util";

export const FREE_RETENTION_MS = 7 * 24 * 3600 * 1000;
export const STAKE_RETENTION_MS = 90 * 24 * 3600 * 1000;
export const CLEANUP_INTERVAL_MS = 24 * 3600 * 1000;

export function archiveDir(): string {
  return process.env.MINECLASH_ARCHIVE_DIR ?? "./data/archive";
}

// mineclash #23: noch kein Einsatz-Flag am Match; hier einhaengen, sobald es
// existiert (Einsatz-Matches 90 Tage statt 7).
export function isStakeMatch(_record: GameRecord): boolean {
  return false;
}

// Einsatz-Matches tragen ".stake" im Dateinamen, damit der Aufraeumjob nicht
// jede Datei entpacken muss.
const file = (id: string, stake: boolean) =>
  path.join(archiveDir(), `${id}${stake ? ".stake" : ""}.json.gz`);

export async function writeMatchRecord(record: GameRecord): Promise<void> {
  const id = record.info.gameID;
  if (!ID.safeParse(id).success) throw new Error(`invalid game ID: ${id}`);
  await fs.mkdir(archiveDir(), { recursive: true });
  const target = file(id, isStakeMatch(record));
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, gzipSync(JSON.stringify(record, replacer)));
  await fs.rename(tmp, target); // atomar
}

export async function readMatchRecord(gameId: GameID): Promise<unknown> {
  if (!ID.safeParse(gameId).success) return null;
  for (const stake of [false, true]) {
    try {
      const gz = await fs.readFile(file(gameId, stake));
      return JSON.parse(gunzipSync(gz).toString());
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  return null;
}

// Fuer oeffentliche Auslieferung: PII/Reports raus (wie die alte API).
export function scrubForPublic(record: any): unknown {
  return {
    ...record,
    info: {
      ...record.info,
      reports: undefined,
      players: record.info.players.map((p: any) => ({
        ...p,
        persistentID: null,
      })),
    },
  };
}

export async function cleanupArchive(now = Date.now()): Promise<number> {
  let removed = 0;
  let names: string[];
  try {
    names = await fs.readdir(archiveDir());
  } catch {
    return 0;
  }
  for (const name of names) {
    const full = path.join(archiveDir(), name);
    const ttl = name.endsWith(".stake.json.gz")
      ? STAKE_RETENTION_MS
      : FREE_RETENTION_MS; // inkl. liegengebliebener .tmp
    try {
      const { mtimeMs } = await fs.stat(full);
      if (now - mtimeMs > ttl) {
        await fs.rm(full, { force: true });
        removed++;
      }
    } catch {
      // parallel von anderem Worker geloescht
    }
  }
  return removed;
}

export function startArchiveCleanup(): void {
  const run = () => void cleanupArchive().catch(() => {});
  run();
  setInterval(run, CLEANUP_INTERVAL_MS).unref();
}
