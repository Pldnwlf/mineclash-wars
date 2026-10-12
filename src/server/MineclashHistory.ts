// mineclash #40: Match-Historie je Spieler. Beim Archivieren eine JSONL-Zeile
// pro Teilnehmer in MINECLASH_DATA_DIR/history/<uuid>.jsonl; Aufraeumen mit
// derselben Frist wie das Archiv (7 Tage, Einsatz 90).
import { GameRecord } from "@openfront/shared/WireSchemas";
import { promises as fs } from "fs";
import path from "path";
import {
  CLEANUP_INTERVAL_MS,
  FREE_RETENTION_MS,
  isStakeMatch,
  STAKE_RETENTION_MS,
} from "./MineclashArchive";
import { dataDir, toUuid } from "./MineclashReports";

export const HISTORY_LIMIT = 50;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HistoryResult = "won" | "lost" | "none" | "unfinished";

export type HistoryEntry = {
  id: string;
  end: number;
  map: string;
  mode: string;
  type: string;
  result: HistoryResult;
  playerCount: number;
  stake: boolean;
  /** Mitspieler (zum Melden); UUIDs sind nur fuer Teilnehmer sichtbar. */
  players: { uuid: string; name: string }[];
  // Gefuellt mit #22/#23/#39.
  stakeCoins?: number;
  netCoins?: number;
  payoutStatus?: string;
};

const historyDir = () => path.join(dataDir(), "history");
const userFile = (uuid: string) => path.join(historyDir(), `${uuid}.jsonl`);

function resultOf(winner: any, clientID: string): HistoryResult {
  if (!winner) return "unfinished";
  if (winner[0] === "none") return "none";
  const ids: string[] =
    winner[0] === "player"
      ? winner.slice(1)
      : winner[0] === "team"
        ? winner.slice(2)
        : [];
  return ids.includes(clientID) ? "won" : "lost";
}

export async function writeHistory(record: GameRecord): Promise<void> {
  const info = record.info;
  const humans = info.players
    .map((p) => ({ p, uuid: toUuid(p.persistentID ?? "") }))
    .filter((h) => UUID_RE.test(h.uuid));
  if (humans.length === 0) return;
  await fs.mkdir(historyDir(), { recursive: true });
  for (const { p, uuid } of humans) {
    const entry: HistoryEntry = {
      id: info.gameID,
      end: info.end,
      map: String(info.config.gameMap),
      mode: String(info.config.gameMode),
      type: String(info.config.gameType),
      result: resultOf(info.winner, p.clientID),
      playerCount: info.players.length,
      stake: isStakeMatch(record),
      players: humans
        .filter((h) => h.uuid !== uuid)
        .map((h) => ({ uuid: h.uuid, name: h.p.username })),
    };
    await fs.appendFile(userFile(uuid), JSON.stringify(entry) + "\n");
  }
}

async function readLines(file: string): Promise<HistoryEntry[]> {
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const out: HistoryEntry[] = [];
  for (const l of text.split("\n")) {
    try {
      if (l) out.push(JSON.parse(l));
    } catch {
      // halb geschriebene Zeile ignorieren
    }
  }
  return out;
}

/** Eigene Matches, neueste zuerst, ohne Doppel (je Match-ID). */
export async function readHistory(
  persistentId: string,
  limit = HISTORY_LIMIT,
): Promise<HistoryEntry[]> {
  const uuid = toUuid(persistentId);
  if (!UUID_RE.test(uuid)) return [];
  const seen = new Set<string>();
  return (await readLines(userFile(uuid)))
    .sort((a, b) => b.end - a.end)
    .filter((e) => !seen.has(e.id) && seen.add(e.id))
    .slice(0, limit);
}

/** GET /api/history: nur eigene, Gaeste 403. */
export async function historyResponse(
  persistentId: string,
  claims: { guest?: boolean } | null,
): Promise<{
  status: number;
  body: { matches?: HistoryEntry[]; error?: string };
}> {
  if (claims?.guest === true) return { status: 403, body: { error: "guest" } };
  return { status: 200, body: { matches: await readHistory(persistentId) } };
}

export async function cleanupHistory(now = Date.now()): Promise<number> {
  let removed = 0;
  let names: string[];
  try {
    names = await fs.readdir(historyDir());
  } catch {
    return 0;
  }
  for (const name of names) {
    const file = path.join(historyDir(), name);
    try {
      const all = await readLines(file);
      const keep = all.filter(
        (e) =>
          now - e.end <= (e.stake ? STAKE_RETENTION_MS : FREE_RETENTION_MS),
      );
      removed += all.length - keep.length;
      if (keep.length === all.length) continue;
      if (keep.length === 0) await fs.rm(file, { force: true });
      else
        await fs.writeFile(
          file,
          keep.map((e) => JSON.stringify(e)).join("\n") + "\n",
        );
    } catch {
      // parallel von anderem Worker veraendert
    }
  }
  return removed;
}

export function startHistoryCleanup(): void {
  const run = () => void cleanupHistory().catch(() => {});
  run();
  setInterval(run, CLEANUP_INTERVAL_MS).unref();
}
