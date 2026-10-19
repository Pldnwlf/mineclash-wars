// mineclash #22/#25/#42: Wallet-Schicht des Spielservers ueber MineclashApiClient.
//
// - hold/release/releaseAll: Einsaetze reservieren (Betrag fix in Coins).
// - settle: Ergebnis wird ZUERST atomar nach <MINECLASH_DATA_DIR>/settles/<matchId>.json
//   geschrieben, dann mit Backoff an die Wallet gemeldet (event_id = Match-ID,
//   doppelte Aufrufe sind harmlos). Erst nach Erfolg wird die Datei geloescht.
//   Die Dateien sind die Wahrheit (Prozess-uebergreifend): Worker schreiben,
//   der Master holt Liegengebliebenes nach und gibt es beim Start an
//   serverStart(open) an.
// - Heartbeat: laufende Matches dieses Prozesses + (Master) alle offenen Settles.
//
// Prozess-Modell: Master ruft start() (serverStart VOR jeder Hold, danach
// Sweep/Heartbeat); Worker rufen startWorker() (nur Heartbeat).
import { promises as fs, readdirSync, readFileSync } from "fs";
import path from "path";
import { logger } from "../Logger";
import {
  alertAuszahlung,
  alertNachrechnung,
  alertWallet,
} from "../MineclashAlerts";
import { dataDir, toUuid } from "../MineclashReports";
import type { MineclashResult } from "../MineclashVerify";
import { ServerEnv } from "../ServerEnv";
import {
  MineclashApiClient,
  MineclashApiError,
  RefundReason,
  SettleRequest,
  SettleRequestSchema,
} from "./MineclashApi";
import { writeFinal, writePending } from "./MineclashResultStore";

const log = logger.child({ comp: "wallet" });

export const SETTLE_ALERT_AFTER_MS = 15 * 60 * 1000;

/** #23: Einsatz einer Lobby (Coins, fix) oder undefined = Gratis-Match. */
export function stakeOf(config: {
  mineclashStake?: { coins: number };
}): number | undefined {
  return config.mineclashStake?.coins;
}

const settlesDir = () => path.join(dataDir(), "settles");

/** #42: Auszahlung offen? (sync, prozess-uebergreifend, fuer den Drain) */
export function hasOpenSettleFiles(dir = settlesDir()): boolean {
  return openSettleIds(dir).length > 0;
}
function openSettleIds(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
}

export interface SettleJob {
  request: SettleRequest;
  /** uuids whose hold is released before the settle (never spawned). */
  release?: string[];
  createdAt: number;
}

const REFUND_REASON: Record<string, RefundReason> = {
  no_human_winner: "nations_won",
  too_few_humans: "too_few_humans",
  mismatch: "recount_mismatch",
  error: "recount_mismatch",
  aborted: "aborted",
};

/**
 * #25: MineclashResult -> settle-Request. Gewinner ohne Hold bekommen nie Geld:
 * dann Rueckzahlung (keine Rake) + `problem` fuer den Alarm.
 */
export function buildSettleRequest(
  matchId: string,
  result: MineclashResult,
  stakesByUuid: Record<string, number>,
  uuidOfClient: (clientId: string) => string | undefined,
): { request: SettleRequest; release?: string[]; problem?: string } {
  const refund = (reason: RefundReason, problem?: string) => ({
    request: {
      event_id: matchId,
      match_id: matchId,
      outcome: { kind: "refund" as const, reason },
    },
    problem,
  });
  if (result.kind === "refund") {
    return refund(REFUND_REASON[result.reason] ?? "aborted");
  }
  const uuids: string[] = [];
  for (const c of result.clientIds) {
    const u = uuidOfClient(c);
    if (u === undefined || !(u in stakesByUuid)) {
      return refund("recount_mismatch", "winner without hold");
    }
    if (!uuids.includes(u)) uuids.push(u);
  }
  if (uuids.length === 0) return refund("recount_mismatch", "no winners");
  // Never spawned: stake back (hold released, so it is not in the pot).
  const release = (result.notSpawned ?? [])
    .map(uuidOfClient)
    .filter((u): u is string => u !== undefined && u in stakesByUuid);
  return {
    ...(release.length > 0 ? { release } : {}),
    request: {
      event_id: matchId,
      match_id: matchId,
      // Gleichstand/Team: alle parts 1 (Rundungsrest verbrennt die Wallet).
      outcome: {
        kind: "winners",
        winners: uuids.map((uuid) => ({ uuid, parts: 1 })),
      },
    },
  };
}

export interface WalletOptions {
  api: MineclashApiClient;
  serverId: string;
  dir?: string;
  now?: () => number;
  /** Retry-Backoff (ms): Start, Maximum. */
  backoff?: [number, number];
  heartbeatMs?: number;
  sweepMs?: number;
  /** Worker: PID des Masters, der die Bereit-Datei schreibt (Default ppid). */
  masterPid?: number;
}

export class MineclashWallet {
  private readonly dir: string;
  private readonly resultsDir: string;
  private readonly now: () => number;
  private readonly backoff: [number, number];
  // Master: erst nach serverStart; Worker forken erst danach (Master.ts).
  private ready: boolean;
  private stopped = false;
  private isMaster = false;
  /** matchId -> uuid -> coins (nur dieser Prozess, nur laufende Matches). */
  private readonly holds = new Map<string, Map<string, number>>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private timers: NodeJS.Timeout[] = [];

  constructor(private readonly o: WalletOptions) {
    this.dir = o.dir ?? settlesDir();
    this.resultsDir = path.join(this.dir, "..", "results");
    this.now = o.now ?? Date.now;
    this.backoff = o.backoff ?? [1000, 60_000];
    this.ready = false;
  }

  private readyFile() {
    return path.join(this.dir, "wallet-ready");
  }

  /**
   * Hold erlaubt? Master: serverStart war erfolgreich. Worker: der Master hat
   * es per Datei bestaetigt (prozess-uebergreifend, Datei enthaelt seine PID,
   * ein Rest eines frueheren Masters zaehlt nicht).
   */
  isReady(): boolean {
    if (this.ready) return true;
    try {
      return (
        readFileSync(this.readyFile(), "utf8") ===
        String(this.o.masterPid ?? process.ppid)
      );
    } catch {
      return false;
    }
  }

  // ---- Start --------------------------------------------------------------

  /** Master: serverStart(open) mit Retry, danach Nachholen + Heartbeat. */
  async start(): Promise<void> {
    this.isMaster = true;
    await fs.mkdir(this.dir, { recursive: true });
    await fs.rm(this.readyFile(), { force: true });
    const t0 = this.now();
    let delay = this.backoff[0];
    while (!this.stopped) {
      try {
        await this.o.api.serverStart({
          server_id: this.o.serverId,
          open_settle_match_ids: openSettleIds(this.dir),
        });
        break;
      } catch (e) {
        log.warn(`server-start failed: ${(e as Error).message}`);
        if (this.now() - t0 > 5 * 60_000)
          void alertWallet("server-start nicht erreichbar");
        await sleep(delay);
        delay = Math.min(delay * 2, this.backoff[1]);
      }
    }
    await fs.writeFile(this.readyFile(), String(process.pid));
    this.ready = true;
    this.startHeartbeat();
    const sweep = () => void this.sweep();
    sweep();
    this.timers.push(setInterval(sweep, this.o.sweepMs ?? 30_000).unref());
  }

  /** Nur Heartbeat (Worker-Prozesse). Holds erst nach start() im Master. */
  startWorker(): void {
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    void this.heartbeat();
    this.timers.push(
      setInterval(
        () => void this.heartbeat(),
        this.o.heartbeatMs ?? 60_000,
      ).unref(),
    );
  }

  stop(): void {
    this.stopped = true;
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  async heartbeat(): Promise<void> {
    const ids = new Set([...this.holds.keys(), ...this.inFlight.keys()]);
    if (this.isMaster) openSettleIds(this.dir).forEach((i) => ids.add(i));
    if (ids.size === 0) return;
    try {
      await this.o.api.heartbeat({
        server_id: this.o.serverId,
        match_ids: [...ids],
      });
    } catch (e) {
      log.warn(`heartbeat failed: ${(e as Error).message}`);
    }
  }
  // ---- Holds --------------------------------------------------------------

  async hold(matchId: string, uuid: string, coins: number): Promise<void> {
    if (!this.isReady()) throw new MineclashApiError(503, "wallet_not_ready");
    await this.o.api.hold({
      match_id: matchId,
      uuid,
      coins,
      server_id: this.o.serverId,
    });
    let m = this.holds.get(matchId);
    if (!m) this.holds.set(matchId, (m = new Map()));
    m.set(uuid, coins);
  }

  async release(matchId: string, uuid: string): Promise<void> {
    try {
      await this.o.api.release({ match_id: matchId, uuid });
    } catch (e) {
      // Wallet down: die Hold verfaellt 1 h nach dem letzten Lebenszeichen.
      log.warn(`release failed: ${(e as Error).message}`);
    }
    const m = this.holds.get(matchId);
    m?.delete(uuid);
    if (m?.size === 0) this.holds.delete(matchId);
  }

  async releaseAll(matchId: string): Promise<void> {
    const m = this.holds.get(matchId);
    if (!m) return;
    await Promise.all([...m.keys()].map((u) => this.release(matchId, u)));
    this.holds.delete(matchId);
  }

  /** #23: Tageskurs (W$ je Coin), 10 Min gecacht; null = Wallet nicht erreichbar. */
  private rateCache?: { wd: number; at: number };
  async wdPerCoin(): Promise<number | null> {
    if (this.rateCache && this.now() - this.rateCache.at < 600_000)
      return this.rateCache.wd;
    try {
      const wd = (await this.o.api.rate()).wd_per_coin;
      this.rateCache = { wd, at: this.now() };
      return wd;
    } catch (e) {
      log.warn(`rate failed: ${(e as Error).message}`);
      return this.rateCache?.wd ?? null;
    }
  }

  /** #23: Guthaben (Coins: balance = held+available) oder null. */
  async balanceOf(
    uuid: string,
  ): Promise<{ balance: number; available: number } | null> {
    try {
      return await this.o.api.balance(uuid);
    } catch {
      return null;
    }
  }

  stakesOf(matchId: string): Record<string, number> {
    return Object.fromEntries(this.holds.get(matchId) ?? []);
  }

  // ---- Settle -------------------------------------------------------------

  /**
   * Ergebnis dauerhaft ablegen und (im Hintergrund) bis zum Erfolg melden.
   * Resolved, sobald die Datei sicher liegt; `settled(matchId)` wartet auf
   * die Bestaetigung.
   */
  async settle(
    matchId: string,
    result: MineclashResult,
    stakesByUuid: Record<string, number>,
    uuidOfClient: (clientId: string) => string | undefined,
  ): Promise<void> {
    const { request, release, problem } = buildSettleRequest(
      matchId,
      result,
      stakesByUuid,
      uuidOfClient,
    );
    if (problem) {
      log.error(`settle ${matchId}: ${problem} -> refund`);
      void alertNachrechnung(`${problem}, Einsaetze zurueck`);
    }
    await this.persist({ request, release, createdAt: this.now() });
    const inPot = Object.fromEntries(
      Object.entries(stakesByUuid).filter(([u]) => !release?.includes(u)),
    );
    // mineclash #39: Ergebnis fuer den Endscreen ("wird geprueft")
    await writePending(matchId, request, inPot, this.resultsDir).catch((e) =>
      log.warn(`result pending failed: ${(e as Error).message}`),
    );
    this.holds.delete(matchId);
    this.run(matchId);
  }

  /** Test/Drain: wartet auf die Bestaetigung eines laufenden Settles. */
  settled(matchId: string): Promise<void> {
    return this.inFlight.get(matchId) ?? Promise.resolve();
  }

  private file(matchId: string) {
    return path.join(this.dir, `${matchId}.json`);
  }

  private async persist(job: SettleJob, overwrite = false): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const f = this.file(job.request.match_id);
    // Nicht ueberschreiben: das erste Ergebnis gilt (Idempotenz ueber event_id).
    if (!overwrite) {
      try {
        await fs.access(f);
        return;
      } catch {
        /* neu */
      }
    }
    const tmp = `${f}.${process.pid}.tmp`;
    const fh = await fs.open(tmp, "w");
    try {
      await fh.writeFile(JSON.stringify(job));
      await fh.sync();
    } finally {
      await fh.close();
    }
    await fs.rename(tmp, f);
  }

  /** Master: alle liegengebliebenen Dateien (auch von toten Workern) nachholen. */
  async sweep(): Promise<void> {
    for (const id of openSettleIds(this.dir)) this.run(id);
    await this.heartbeat();
  }

  private run(matchId: string): void {
    if (this.inFlight.has(matchId)) return;
    const p = this.deliver(matchId).finally(() =>
      this.inFlight.delete(matchId),
    );
    this.inFlight.set(matchId, p);
  }

  private async deliver(matchId: string): Promise<void> {
    let delay = this.backoff[0];
    while (!this.stopped) {
      let job: SettleJob;
      try {
        job = JSON.parse(readFileSync(this.file(matchId), "utf8"));
        SettleRequestSchema.parse(job.request);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return; // schon erledigt
        log.error(
          `settle ${matchId}: unlesbare Datei: ${(e as Error).message}`,
        );
        void alertAuszahlung("settle-datei unlesbar");
        return;
      }
      try {
        // Idempotent (no-op without an active hold), so a retry is safe.
        for (const uuid of job.release ?? [])
          await this.o.api.release({ match_id: matchId, uuid });
        const r = await this.o.api.settle(job.request);
        log.info(`settled ${matchId}`, {
          kind: r.kind,
          pot: r.pot,
          burned: r.burned,
          replayed: r.replayed,
        });
        // mineclash #39: Endstand VOR dem Loeschen (ueberlebt Neustart)
        const fin = await writeFinal(
          matchId,
          job.request,
          r,
          this.resultsDir,
        ).catch((e) => {
          log.warn(`result final failed: ${(e as Error).message}`);
          return { mismatch: false };
        });
        if (fin.mismatch) {
          log.error(`settle ${matchId}: Wallet-Antwort weicht von Regel ab`);
          void alertAuszahlung("settle-antwort weicht von Regel ab");
        }
        await fs.rm(this.file(matchId), { force: true });
        return;
      } catch (e) {
        const err = e as Error;
        if (e instanceof MineclashApiError && e.status < 500) {
          if (
            e.code === "winner_not_held" &&
            job.request.outcome.kind === "winners"
          ) {
            // Gewinner ohne Hold darf nie Geld bekommen: alle Einsaetze zurueck.
            log.error(`settle ${matchId}: winner_not_held -> refund`);
            void alertNachrechnung("winner_not_held, Einsaetze zurueck");
            job.request.outcome = {
              kind: "refund",
              reason: "recount_mismatch",
            };
            await this.persist(job, true);
            continue;
          }
          if (e.status !== 408 && e.status !== 429) {
            // Endgueltig abgelehnt (z.B. settle_conflict): ein Mensch muss ran.
            // Datei bleibt liegen (Drain wartet), Alarm.
            log.error(`settle ${matchId}: ${err.message}`);
            void alertAuszahlung(`settle abgelehnt ${e.code}`);
            await sleep(this.backoff[1]);
            continue;
          }
        }
        log.warn(`settle ${matchId} failed: ${err.message}`);
        if (this.now() - job.createdAt > SETTLE_ALERT_AFTER_MS)
          void alertAuszahlung("settle seit > 15 Min offen");
        await sleep(delay);
        delay = Math.min(delay * 2, this.backoff[1]);
      }
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- Prozess-Singleton ----------------------------------------------------

let instance: MineclashWallet | null | undefined;

function serverIdFromEnv(): string {
  const v = process.env.MINECLASH_SERVER_ID;
  return v !== undefined && v !== "" ? v : "mineclash-1";
}

/** #23: false => Einsatz-Lobbys gerade nicht verfuegbar (Gratis laeuft normal). */
export function walletReady(): boolean {
  return getWallet()?.isReady() ?? false;
}

/** null, wenn MINECLASH_API_URL nicht gesetzt (Wallet aus). */
export function getWallet(): MineclashWallet | null {
  if (instance !== undefined) return instance;
  const url = ServerEnv.mineclashApiUrl();
  instance = url
    ? new MineclashWallet({
        api: new MineclashApiClient(url, ServerEnv.apiKey()),
        serverId: serverIdFromEnv(),
      })
    : null;
  return instance;
}

/** Ergebnis-Handler fuer GameServer (#24 -> #22). */
export function handleMineclashResult(
  wallet: MineclashWallet | null,
  matchId: string,
  result: MineclashResult,
  config: { mineclashStake?: { coins: number } },
  persistentIdOf: (clientId: string) => string | undefined,
): Promise<void> {
  if (!wallet || stakeOf(config) === undefined) return Promise.resolve();
  return wallet.settle(matchId, result, wallet.stakesOf(matchId), (c) => {
    const p = persistentIdOf(c);
    return p === undefined ? undefined : toUuid(p);
  });
}
