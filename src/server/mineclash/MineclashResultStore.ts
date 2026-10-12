// mineclash #39: dauerhaftes Ergebnis je Einsatz-Match in
// <MINECLASH_DATA_DIR>/results/<gameId>.json. "pending" sobald das Ergebnis
// feststeht, "paid"/"refunded" nach bestaetigtem Settle (Betraege aus der
// Wallet-Antwort). Nur UUIDs der Gewinner, keine Namen.
import { promises as fs, readFileSync } from "fs";
import path from "path";
import { dataDir } from "../MineclashReports";
import type { SettleRequest, SettleResponse } from "./MineclashApi";

export type ResultBody = {
  status: "pending" | "paid" | "refunded" | "none";
  reason?: string;
  stakeCoins?: number;
  potCoins?: number;
  rakeCoins?: number;
  payouts?: { uuid: string; coins: number }[];
};

export const GAME_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const RESULT_RETENTION_MS = 90 * 24 * 3600 * 1000;
const DEFAULT_RAKE_BPS = 500;

export const resultsDir = () => path.join(dataDir(), "results");
const fileIn = (dir: string, id: string) => path.join(dir, `${id}.json`);

/** Wallet-Regel: Rake floor(Topf*bps/10000), Rest nach parts je floor. */
export function expectedPayouts(
  pot: number,
  winners: { uuid: string; parts: number }[],
  bps = DEFAULT_RAKE_BPS,
): { rake: number; payouts: { uuid: string; coins: number }[] } {
  const rake = Math.floor((pot * bps) / 10000);
  const total = winners.reduce((s, w) => s + w.parts, 0);
  return {
    rake,
    payouts: winners.map((w) => ({
      uuid: w.uuid,
      coins: Math.floor(((pot - rake) * w.parts) / total),
    })),
  };
}

export async function readResult(
  id: string,
  dir = resultsDir(),
): Promise<ResultBody> {
  if (!GAME_ID_RE.test(id)) return { status: "none" };
  try {
    return JSON.parse(await fs.readFile(fileIn(dir, id), "utf8"));
  } catch {
    return { status: "none" };
  }
}

/** Sync-Variante fuer die Historie. */
export function readResultSync(id: string, dir = resultsDir()): ResultBody {
  if (!GAME_ID_RE.test(id)) return { status: "none" };
  try {
    return JSON.parse(readFileSync(fileIn(dir, id), "utf8"));
  } catch {
    return { status: "none" };
  }
}

async function write(dir: string, id: string, body: ResultBody) {
  await fs.mkdir(dir, { recursive: true });
  const f = fileIn(dir, id);
  const tmp = `${f}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(body));
  await fs.rename(tmp, f);
}

/** Ergebnis steht fest, Auszahlung laeuft. Ueberschreibt nie ein Endergebnis. */
export async function writePending(
  id: string,
  request: SettleRequest,
  stakes: Record<string, number>,
  dir = resultsDir(),
): Promise<void> {
  if ((await readResult(id, dir)).status !== "none") return;
  const coins = Object.values(stakes);
  await write(dir, id, {
    status: "pending",
    reason:
      request.outcome.kind === "refund" ? request.outcome.reason : undefined,
    stakeCoins: coins.length > 0 ? Math.max(...coins) : undefined,
    potCoins: coins.reduce((s, c) => s + c, 0),
  });
}

/** Settle bestaetigt: Endstand aus der Wallet-Antwort. */
export async function writeFinal(
  id: string,
  request: SettleRequest,
  r: SettleResponse,
  dir = resultsDir(),
): Promise<{ mismatch: boolean }> {
  const old = await readResult(id, dir);
  const o = request.outcome;
  let rake = 0;
  let mismatch = false;
  if (o.kind === "winners" && r.kind === "winners") {
    const exp = expectedPayouts(r.pot, o.winners, o.rake_bps);
    rake = exp.rake;
    mismatch =
      JSON.stringify(exp.payouts) !== JSON.stringify(r.payouts) ||
      r.burned < exp.rake;
  }
  await write(dir, id, {
    status: r.kind === "refund" ? "refunded" : "paid",
    reason: o.kind === "refund" ? o.reason : undefined,
    stakeCoins: old.stakeCoins,
    potCoins: r.pot,
    rakeCoins: rake,
    payouts: r.payouts,
  });
  return { mismatch };
}

export async function cleanupResults(
  now = Date.now(),
  dir = resultsDir(),
): Promise<void> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return;
  }
  for (const n of names) {
    try {
      const f = path.join(dir, n);
      if (now - (await fs.stat(f)).mtimeMs > RESULT_RETENTION_MS)
        await fs.rm(f, { force: true });
    } catch {
      // parallel entfernt
    }
  }
}
