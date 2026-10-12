// mineclash #41: Deploy ohne Match-Abbruch ("Drain").
//
// Ausloeser: SIGTERM/SIGUSR2 am Master oder POST /api/admin/drain (Header
// x-api-key). Danach: keine neuen Lobbys, offene Lobbys zu, laufende Matches
// spielen fertig, der Prozess beendet sich erst bei 0 Matches und keinen
// offenen Settles. Status: GET /api/health (draining, runningMatches, ...).
// Das Deploy-Skript ist scripts/mineclash-deploy.sh.
import { createHash, timingSafeEqual } from "crypto";
import type { Express, Request } from "express";
import type { MasterLobbyService } from "../MasterLobbyService";
import { ServerEnv } from "../ServerEnv";

/** Obergrenze (Minuten) fuer Matches ab Drain-Start; danach Abbruch. */
export function drainMaxMatchMs(): number {
  const n = Number(process.env.DRAIN_MAX_MATCH_MINUTES);
  return (Number.isFinite(n) && n > 0 ? n : 60) * 60_000;
}

/** Eigenes Secret, sonst der API-Key; leer = Admin-Endpunkt aus. */
function drainSecret(): string {
  const own = process.env.MINECLASH_DRAIN_KEY;
  return own !== undefined && own !== "" ? own : ServerEnv.apiKey();
}

export function drainAuthorized(provided: unknown): boolean {
  const secret = drainSecret();
  if (secret === "" || typeof provided !== "string") return false;
  const h = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(h(provided), h(secret));
}

/**
 * mineclash #42: true solange Auszahlungen (Settles) noch nicht bestaetigt
 * sind. Der Prozess darf dann nicht beenden. Heute immer false.
 */
export function hasPendingSettles(): boolean {
  return false;
}

export function drainStatus(service: MasterLobbyService | undefined) {
  const started = service?.drainStartedAtMs() ?? null;
  return {
    draining: started !== null,
    drainStartedAt: started,
    runningMatches: service?.liveGames() ?? 0,
    pendingSettles: hasPendingSettles(),
  };
}

export function registerDrainRoutes(
  app: Express,
  getService: () => MasterLobbyService | undefined,
) {
  app.post("/api/admin/drain", (req: Request, res) => {
    if (!drainAuthorized(req.header("x-api-key"))) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const service = getService();
    service?.startDrain();
    res.json(drainStatus(service));
  });
}

/**
 * Master-Prozess: Signale + Beenden. `exit` ist injizierbar (Tests).
 * Ein zweites Signal beendet sofort.
 */
export function installDrain(
  service: MasterLobbyService,
  log: { info: (m: string) => void; warn: (m: string) => void },
  exit: (code: number) => void = (c) => process.exit(c),
  intervalMs = 2000,
) {
  const onSignal = (sig: string) => {
    if (service.isDraining()) {
      log.warn(`${sig} while draining, exiting now`);
      exit(0);
      return;
    }
    log.info(`${sig}: starting drain`);
    service.startDrain();
  };
  process.on("SIGTERM", () => onSignal("SIGTERM"));
  process.on("SIGUSR2", () => onSignal("SIGUSR2"));

  let idleChecks = 0;
  const timer = setInterval(() => check(), intervalMs);
  timer.unref();
  function check() {
    const started = service.drainStartedAtMs();
    if (started === null) return;
    const age = Date.now() - started;
    // Workers abort at the cap themselves; this is the backstop.
    if (age > drainMaxMatchMs() + 120_000) {
      log.warn("drain cap exceeded, exiting");
      exit(0);
      return;
    }
    // Worker reports lag the drain broadcast: wait a moment and require the
    // idle state twice in a row so a game created just before the drain is
    // not missed.
    const idle =
      age > 5000 && service.liveGames() === 0 && !hasPendingSettles();
    idleChecks = idle ? idleChecks + 1 : 0;
    if (idleChecks >= 2) {
      log.info("drain finished, exiting");
      exit(0);
    }
  }
  return check;
}
