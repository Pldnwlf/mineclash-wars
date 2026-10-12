import EventEmitter from "events";
import express from "express";
import http from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameManager } from "../../src/server/GameManager";
import { GamePhase } from "../../src/server/GameServer";
import { MasterLobbyService } from "../../src/server/MasterLobbyService";
import {
  drainAuthorized,
  installDrain,
  registerDrainRoutes,
} from "../../src/server/mineclash/MineclashDrain";
import { startPolling } from "../../src/server/PollingLoop";
import { ServerEnv } from "../../src/server/ServerEnv";
import {
  makeClient,
  makeGame,
  mockLogger,
  startGame,
} from "../util/GameServerHarness";

vi.mock("../../src/server/Logger", () => ({
  logger: { child: () => ({ error: vi.fn(), info: vi.fn() }) },
}));
vi.mock("../../src/server/PollingLoop", () => ({ startPolling: vi.fn() }));

function mockWorker() {
  const w = new EventEmitter() as EventEmitter & {
    send: ReturnType<typeof vi.fn>;
  };
  w.send = vi.fn();
  return w;
}

function task(ms: number): () => Promise<void> {
  const call = vi.mocked(startPolling).mock.calls.find(([, i]) => i === ms);
  if (!call) throw new Error("loop not started");
  return call[0];
}

function masterWithWorker() {
  vi.stubEnv("DOMAIN", "localhost");
  vi.spyOn(ServerEnv, "numWorkers").mockReturnValue(1);
  const playlist = { gameConfig: vi.fn(async () => ({})) };
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
  const service = new MasterLobbyService(playlist as any, log);
  const worker = mockWorker();
  service.registerWorker(0, worker as any);
  worker.emit("message", { type: "workerReady", workerId: 0 });
  return { service, worker, log };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(startPolling).mockClear();
});

describe("master drain", () => {
  it("rotation creates no new lobbies and broadcast says draining", async () => {
    const { service, worker } = masterWithWorker();
    await task(1000)();
    expect(
      worker.send.mock.calls.filter(([m]) => m.type === "createGame").length,
    ).toBeGreaterThan(0);

    worker.send.mockClear();
    service.startDrain();
    await task(1000)();
    await task(500)();
    const types = worker.send.mock.calls.map(([m]) => m.type);
    expect(types).not.toContain("createGame");
    expect(types).not.toContain("updateLobby");
    const bc = worker.send.mock.calls.find(
      ([m]) => m.type === "lobbiesBroadcast",
    );
    expect(bc?.[0].draining).toBe(true);
    expect(bc?.[0].active).toBe(true);
  });

  it("refuses coordinator createGame while draining", async () => {
    const { service, worker } = masterWithWorker();
    service.startDrain();
    await (service as any).handleCoordinatorCreate({ publicGameType: "ffa" });
    expect(worker.send).not.toHaveBeenCalled();
  });
});

describe("GameManager drain", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function manager() {
    const gm = new GameManager(mockLogger());
    const add = (g: any) => (gm as any).games.set(g.id, g);
    return { gm, add };
  }

  it("blocks new games", () => {
    const { gm } = manager();
    gm.startDrain();
    expect(gm.createGame("ABCD1234", {})).toBeNull();
  });

  it("closes unstarted lobbies but lets a running match finish", () => {
    const { gm, add } = manager();
    const lobby = makeGame({ id: "LOBBY001" });
    const running = makeGame({ id: "RUN00001" });
    running.joinClient(makeClient());
    startGame(running);
    add(lobby);
    add(running);

    gm.startDrain();
    gm.tick();

    expect(lobby.phase()).toBe(GamePhase.Finished);
    expect(gm.game("LOBBY001")).toBeNull();
    expect(gm.game("RUN00001")).not.toBeNull();
    expect(gm.activeGames()).toBe(1);
  });

  it("aborts running matches after the drain cap", () => {
    vi.stubEnv("DRAIN_MAX_MATCH_MINUTES", "10");
    const { gm, add } = manager();
    const running = makeGame({ id: "RUN00001" });
    running.joinClient(makeClient());
    startGame(running);
    running.pruneStaleClients = () => {}; // no pings under fake time
    add(running);

    gm.startDrain();
    vi.advanceTimersByTime(9 * 60_000);
    gm.tick();
    expect(gm.activeGames()).toBe(1);

    vi.advanceTimersByTime(2 * 60_000);
    gm.tick();
    expect(gm.activeGames()).toBe(0);
  });
});

describe("drain exit", () => {
  function fakeService(live: () => number) {
    let started: number | null = null;
    return {
      isDraining: () => started !== null,
      startDrain: () => (started = Date.now()),
      drainStartedAtMs: () => started,
      liveGames: live,
    } as any;
  }
  const log = { info: vi.fn(), warn: vi.fn() };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits for running matches, then exits", () => {
    let live = 1;
    const svc = fakeService(() => live);
    const exit = vi.fn();
    const check = installDrain(svc, log, exit, 1_000_000);
    check();
    expect(exit).not.toHaveBeenCalled(); // not draining

    svc.startDrain();
    vi.advanceTimersByTime(10_000);
    check();
    check();
    expect(exit).not.toHaveBeenCalled(); // match still running

    live = 0;
    check();
    expect(exit).not.toHaveBeenCalled(); // needs two idle checks
    check();
    expect(exit).toHaveBeenCalledWith(0);
  });
});

describe("admin endpoint + status", () => {
  let server: http.Server;
  let base: string;
  let started = false;
  const service = {
    startDrain: () => (started = true),
    drainStartedAtMs: () => (started ? 1 : null),
    liveGames: () => 2,
  } as any;

  beforeEach(async () => {
    started = false;
    vi.stubEnv("MINECLASH_DRAIN_KEY", "s3cret");
    const app = express();
    registerDrainRoutes(app, () => service);
    server = http.createServer(app).listen(0);
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterEach(() => new Promise((r) => server.close(r)));

  it("rejects missing/wrong key and GET", async () => {
    const no = await fetch(`${base}/api/admin/drain`, { method: "POST" });
    expect(no.status).toBe(401);
    const bad = await fetch(`${base}/api/admin/drain`, {
      method: "POST",
      headers: { "x-api-key": "nope" },
    });
    expect(bad.status).toBe(401);
    const get = await fetch(`${base}/api/admin/drain`, {
      headers: { "x-api-key": "s3cret" },
    });
    expect(get.status).toBe(404);
    expect(started).toBe(false);
  });

  it("starts drain with the key and returns status", async () => {
    const res = await fetch(`${base}/api/admin/drain`, {
      method: "POST",
      headers: { "x-api-key": "s3cret" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      draining: true,
      runningMatches: 2,
      pendingSettles: false,
    });
    expect(started).toBe(true);
  });

  it("is off without a configured secret", () => {
    vi.stubEnv("MINECLASH_DRAIN_KEY", "");
    vi.stubEnv("API_KEY", "");
    expect(drainAuthorized("")).toBe(false);
    expect(drainAuthorized(undefined)).toBe(false);
  });

  it("falls back to API_KEY", () => {
    vi.stubEnv("MINECLASH_DRAIN_KEY", "");
    vi.stubEnv("API_KEY", "apikey");
    expect(drainAuthorized("apikey")).toBe(true);
  });
});
