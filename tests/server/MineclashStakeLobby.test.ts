// mineclash #23: Einsatz-Lobbys (Rotation, Beitritt, Hold/Release, Settle) gegen den API-Stub.
// @vitest-environment node
import { GameType } from "@openfront/engine-api/game/GameTypes";
import { MINECLASH_STAKE_SPAWN_TURNS } from "@openfront/engine-api/Schemas";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { createStub, uuidForName } from "../../scripts/mineclash-api-stub";
import { MineclashApiClient } from "../../src/server/mineclash/MineclashApi";
import {
  FREE_ROTATION,
  rotationConfig,
  rotationTimerMs,
  STAKE_ROTATION,
  stakeCoins,
} from "../../src/server/mineclash/MineclashRotation";
import {
  acceptRules,
  validateStakeCreate,
} from "../../src/server/mineclash/MineclashStake";
import {
  handleMineclashResult,
  MineclashWallet,
} from "../../src/server/mineclash/MineclashWallet";
import { cid, makeClient, makeGame, mockWsOf } from "../util/GameServerHarness";

const KEY = "k";
const STAKE = 100;
let stub: Awaited<ReturnType<typeof createStub>>;
let wallet: MineclashWallet;
let seq = 0;

beforeAll(async () => {
  process.env.MINECLASH_DATA_DIR = mkdtempSync(path.join(tmpdir(), "stake-"));
  stub = await createStub({
    issuer: "http://stub.test",
    apiKey: KEY,
    startCoins: 1000,
  });
  await new Promise<void>((r) => stub.server.listen(0, r));
  const base = `http://localhost:${(stub.server.address() as AddressInfo).port}`;
  wallet = new MineclashWallet({
    api: new MineclashApiClient(base, KEY),
    serverId: "s1",
    dir: path.join(process.env.MINECLASH_DATA_DIR, "settles"),
    backoff: [5, 20],
    masterPid: process.pid,
  });
  await wallet.start();
});
afterAll(() => {
  wallet.stop();
  stub.server.close();
});

const bal = (u: string) => stub.ledger.balance(u);
const until = async (f: () => boolean) => {
  for (let i = 0; i < 400 && !f(); i++)
    await new Promise((r) => setTimeout(r, 10));
  expect(f()).toBe(true);
};

// Eingeloggtes Konto (persistentID = UUID, claims.sub = UUID).
function acct(opts: { guest?: boolean; ip?: string; rules?: boolean } = {}) {
  const uuid = uuidForName(`acct${++seq}-${Date.now()}`);
  if (opts.rules !== false) acceptRules(uuid);
  const c = makeClient({ persistentID: uuid, ip: opts.ip });
  Object.assign(c, {
    claims: {
      sub: uuid,
      name: `N${seq}`,
      ...(opts.guest ? { guest: true } : {}),
    },
  });
  return { c, uuid };
}

let gameSeq = 0;
function stakeGame(over: Record<string, unknown> = {}) {
  const id = cid(`s${String(++gameSeq).padStart(3, "0")}`);
  const results: unknown[] = [];
  const game = makeGame({
    id,
    config: {
      gameType: GameType.Public,
      maxPlayers: 10,
      mineclashStake: { coins: STAKE },
      mineclashRules: { endMinutes: 25 },
      ...over,
    },
    deps: {
      wallet: () => wallet,
      onMineclashResult: (gid, result, ctx) => {
        results.push(result);
        void handleMineclashResult(
          wallet,
          gid,
          result,
          ctx.config,
          ctx.persistentIdOf,
        );
      },
    },
  });
  return { game, id, results };
}
const heldCount = (id: string) => Object.keys(wallet.stakesOf(id)).length;
const lastError = (c: ReturnType<typeof makeClient>) =>
  (mockWsOf(c).sent().slice(-1)[0] as { error?: string } | undefined)?.error;

describe("Rotation", () => {
  const playlist = {
    gameConfig: vi.fn(async () => ({
      gameMap: "World",
      maxPlayers: 30,
      trusted: true,
    })),
  } as any;

  test("erzeugt Einsatz (10k$ zum Tageskurs) und Gratis", async () => {
    const stake = await rotationConfig(playlist, STAKE_ROTATION, wallet);
    expect(stake?.mineclashStake).toEqual({ coins: 10 }); // 10000 / 1000
    expect(stake?.trusted).toBeUndefined();
    const free = await rotationConfig(playlist, FREE_ROTATION, wallet);
    expect(free).not.toBeNull();
    expect(free?.mineclashStake).toBeUndefined();
  });

  test("ohne walletReady keine Einsatz-Lobby, Gratis laeuft", async () => {
    const off = new MineclashWallet({
      api: new MineclashApiClient("http://localhost:1", KEY),
      serverId: "x",
      dir: path.join(tmpdir(), "nowhere-" + process.pid),
      masterPid: -1,
    });
    expect(await rotationConfig(playlist, STAKE_ROTATION, off)).toBeNull();
    expect(await rotationConfig(playlist, STAKE_ROTATION, null)).toBeNull();
    expect(await rotationConfig(playlist, FREE_ROTATION, null)).not.toBeNull();
  });

  test("Coins aufgerundet, min 1; Timer 20-90 s linear", () => {
    expect(stakeCoins(10_000, 3000)).toBe(4);
    expect(stakeCoins(10, 1000)).toBe(1);
    expect(rotationTimerMs(20)).toBe(20_000);
    expect(rotationTimerMs(55)).toBe(90_000);
    expect(rotationTimerMs(1000)).toBe(90_000);
    expect(rotationTimerMs(undefined)).toBe(20_000);
    const mid = rotationTimerMs(37);
    expect(mid).toBeGreaterThan(20_000);
    expect(mid).toBeLessThan(90_000);
  });
});

describe("Beitritt", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  test("Gast wird abgewiesen", () => {
    const { game } = stakeGame();
    const { c } = acct({ guest: true });
    expect(game.joinClient(c)).toBe("rejected");
    expect(lastError(c)).toBe("kick_reason.stake_guest");
    expect(game.numClients()).toBe(0);
  });

  test("Regeln nicht akzeptiert", () => {
    const { game } = stakeGame();
    const { c } = acct({ rules: false });
    expect(game.joinClient(c)).toBe("rejected");
    expect(lastError(c)).toBe("kick_reason.stake_rules_not_accepted");
  });

  test("zu wenig Guthaben: Kick nach fehlgeschlagener Hold", async () => {
    const { game, id } = stakeGame({ mineclashStake: { coins: 5000 } });
    const { c } = acct();
    expect(game.joinClient(c)).toBe("joined");
    await until(() => mockWsOf(c).close.mock.calls.length > 0);
    expect(lastError(c)).toBe("kick_reason.stake_insufficient_funds");
    expect(heldCount(id)).toBe(0);
  });

  test("max. 2 Konten pro IP", () => {
    const { game } = stakeGame();
    const ip = "9.9.9.9";
    expect(game.joinClient(acct({ ip }).c)).toBe("joined");
    expect(game.joinClient(acct({ ip }).c)).toBe("joined");
    const third = acct({ ip }).c;
    expect(game.joinClient(third)).toBe("rejected");
    expect(lastError(third)).toBe("kick_reason.stake_ip_limit");
  });

  test("Wallet nicht bereit", () => {
    const { game } = stakeGame();
    const { c } = acct();
    vi.spyOn(wallet, "isReady").mockReturnValueOnce(false);
    expect(game.joinClient(c)).toBe("rejected");
    expect(lastError(c)).toBe("kick_reason.stake_wallet_unavailable");
  });

  test("Verlassen vor dem Start gibt den Einsatz frei", async () => {
    const { game, id } = stakeGame();
    const { c, uuid } = acct();
    game.joinClient(c);
    await until(() => heldCount(id) === 1);
    expect(bal(uuid).held).toBe(STAKE);
    await mockWsOf(c).trigger("close");
    await until(() => bal(uuid).held === 0);
    expect(heldCount(id)).toBe(0);
  });

  test("Hold nach dem Verlassen wird sofort wieder freigegeben", async () => {
    const { game, id } = stakeGame();
    const { c, uuid } = acct();
    game.joinClient(c);
    await mockWsOf(c).trigger("close"); // vor Abschluss der Hold
    await until(() => heldCount(id) === 0 && bal(uuid).held === 0);
  });
});

describe("Start / Abbruch", () => {
  test("Rotation < 2 Menschen: wartet weiter, Einsatz bleibt gehalten", async () => {
    const { game, id } = stakeGame();
    const { c, uuid } = acct();
    game.joinClient(c);
    await until(() => heldCount(id) === 1);
    game.setStartsAt(Date.now() - 1);
    expect(game.cancelShortHandedMatch()).toBe(true);
    expect(game.phase()).toBe("LOBBY");
    expect(bal(uuid).held).toBe(STAKE);
    expect(lastError(c)).toBeUndefined();
  });

  test("Rotation leer: Lobby schliesst, naechste Map kommt", () => {
    const { game } = stakeGame();
    game.setStartsAt(Date.now() - 1);
    expect(game.cancelShortHandedMatch()).toBe(true);
    expect(game.phase()).toBe("FINISHED");
  });

  test("Erster Spieler stoppt den Countdown der leeren Lobby", () => {
    const { game } = stakeGame();
    game.setStartsAt(Date.now() + 10_000);
    game.joinClient(acct().c);
    expect(game.gameInfo().startsAt).toBeUndefined();
  });

  test("Custom < 2 Menschen: releaseAll, Lobby verfaellt", async () => {
    const { game, id } = stakeGame({ gameType: GameType.Private });
    const { c, uuid } = acct();
    game.joinClient(c);
    await until(() => heldCount(id) === 1);
    expect(game.cancelShortHandedMatch()).toBe(true);
    await until(() => bal(uuid).held === 0);
    expect(heldCount(id)).toBe(0);
    expect(game.phase()).toBe("FINISHED");
  });

  test("Drain vor dem Start: releaseAll", async () => {
    const { game, id } = stakeGame();
    const a = acct();
    const b = acct();
    game.joinClient(a.c);
    game.joinClient(b.c);
    await until(() => heldCount(id) === 2);
    game.abortForDrain();
    await until(() => bal(a.uuid).held === 0 && bal(b.uuid).held === 0);
    expect(heldCount(id)).toBe(0);
  });

  test("Drain im laufenden Match: Refund-Settle ohne Rake", async () => {
    const { game, id, results } = stakeGame();
    const a = acct();
    const b = acct();
    game.joinClient(a.c);
    game.joinClient(b.c);
    await until(() => heldCount(id) === 2);
    game.prestart();
    game.start();
    expect(game.hasStarted()).toBe(true);
    game.abortForDrain();
    expect(results).toEqual([{ kind: "refund", reason: "aborted" }]);
    await wallet.settled(id);
    await until(() => bal(a.uuid).held === 0 && bal(a.uuid).balance === 1000);
    expect(bal(b.uuid).balance).toBe(1000);
  });

  test("Nicht gespawnt nach 1 Min: Kick, Einsatz zurueck", async () => {
    const { game, id, results } = stakeGame();
    const [a, b, c] = [acct(), acct(), acct()];
    for (const x of [a, b, c]) game.joinClient(x.c);
    await until(() => heldCount(id) === 3);
    game.prestart();
    game.start();
    // 600 turns committed, a and b spawned in the first one; the next turn kicks.
    (game as any).turns = Array.from(
      { length: MINECLASH_STAKE_SPAWN_TURNS },
      (_, t) => ({
        turnNumber: t,
        intents:
          t === 0
            ? [a, b].map((x) => ({
                type: "spawn",
                clientID: x.c.clientID,
                tile: 0,
              }))
            : [],
      }),
    );
    (game as any).endTurn();
    expect((game as any).isKicked(c.c.clientID)).toBe(true);
    expect((game as any).isKicked(a.c.clientID)).toBe(false);
    expect((game as any).isKicked(b.c.clientID)).toBe(false);

    (game as any).finishVerify(
      {
        winner: ["player", a.c.clientID],
        allPlayersStats: {},
        tick: 1,
        spawnedClientIds: [a.c.clientID, b.c.clientID],
      },
      null,
    );
    expect(results).toEqual([
      {
        kind: "winners",
        clientIds: [a.c.clientID],
        notSpawned: [c.c.clientID],
      },
    ]);
    await until(() => bal(a.uuid).balance === 1090); // Topf 200 (ohne c), Rake 10
    expect(bal(b.uuid).balance).toBe(900);
    expect(bal(c.uuid)).toMatchObject({ balance: 1000, held: 0 });
  });

  test("Ende-zu-Ende: 2 Konten, Gewinner +Topf-5%, Verlierer -Einsatz, Rejoin ohne neue Hold", async () => {
    const { game, id, results } = stakeGame();
    const a = acct({ ip: "7.7.7.7" });
    const b = acct({ ip: "7.7.7.7" }); // geteilte IP => Hinweis-Log
    game.joinClient(a.c);
    game.joinClient(b.c);
    await until(() => heldCount(id) === 2);
    expect(bal(a.uuid).held).toBe(STAKE);

    game.prestart();
    game.start();
    expect(game.hasStarted()).toBe(true);
    const log = path.join(process.env.MINECLASH_DATA_DIR!, "shared-ips.jsonl");
    expect(existsSync(log)).toBe(true);
    expect(readFileSync(log, "utf8")).toContain(id);

    // Rejoin waehrend des Matches: keine neue Hold (Einsatz bleibt einmal gehalten).
    const ws2 = mockWsOf(makeClient());
    expect(game.rejoinClient(ws2 as any, a.c.persistentID)).toBe(true);
    expect(bal(a.uuid).held).toBe(STAKE);
    expect(heldCount(id)).toBe(2);

    // Ergebnis-Hook: a gewinnt (Nachrechnung hat sie bestaetigt).
    (game as any).finishVerify(
      { winner: ["player", a.c.clientID], allPlayersStats: {}, tick: 1 },
      null,
    );
    expect(results).toEqual([{ kind: "winners", clientIds: [a.c.clientID] }]);
    await wallet.settled(id);
    await until(() => bal(a.uuid).balance === 1090);
    expect(bal(b.uuid).balance).toBe(900); // Topf 200, Rake 10 verbrannt
    expect(bal(a.uuid).held).toBe(0);
    expect(bal(b.uuid).held).toBe(0);
  });
});

describe("Custom-Einsatz-Lobby (create_game)", () => {
  async function check(over: Record<string, unknown> = {}) {
    const { uuid } = acct();
    return validateStakeCreate({
      coins: 100,
      claims: { sub: uuid, name: "H" } as any,
      persistentId: uuid,
      config: {},
      wallet,
      hostCheatsOn: false,
      listingError: () => null,
      ...over,
    });
  }

  test("gueltig", async () => {
    expect(await check()).toEqual({ coins: 100 });
  });

  test("Einsatz > Guthaben des Hosts abgelehnt", async () => {
    expect(await check({ coins: 1001 })).toMatchObject({
      status: 402,
      error: "stake_insufficient_funds",
    });
  });

  test("Humans vs Nations abgelehnt", async () => {
    expect(
      await check({
        config: { gameMode: "Team", playerTeams: "Humans Vs Nations" },
      }),
    ).toMatchObject({ error: "stake_humans_vs_nations" });
  });

  test("Gast, Regeln, Wallet, Cheats, ungueltig", async () => {
    expect(await check({ claims: { sub: "x", guest: true } })).toMatchObject({
      error: "stake_guest",
    });
    const { uuid } = acct({ rules: false });
    expect(await check({ persistentId: uuid })).toMatchObject({
      error: "stake_rules_not_accepted",
    });
    expect(await check({ wallet: null })).toMatchObject({
      error: "stake_wallet_unavailable",
    });
    expect(await check({ hostCheatsOn: true })).toMatchObject({
      error: "stake_host_cheats",
    });
    expect(await check({ coins: 0 })).toMatchObject({ error: "stake_invalid" });
    expect(await check({ coins: 1.5 })).toMatchObject({
      error: "stake_invalid",
    });
    expect(
      await check({ listingError: () => "listing_limit_reached" }),
    ).toMatchObject({
      error: "listing_limit_reached",
    });
  });

  test("Host-Leave schliesst die Lobby und gibt alle Einsaetze frei", async () => {
    const host = acct();
    const other = acct();
    const { game, id } = stakeGame({ gameType: GameType.Private });
    (game as any).creatorPersistentID = host.c.persistentID;
    game.joinClient(host.c);
    game.joinClient(other.c);
    await until(() => heldCount(id) === 2);
    await mockWsOf(host.c).trigger("close");
    await until(() => bal(host.uuid).held === 0 && bal(other.uuid).held === 0);
    expect(game.phase()).toBe("FINISHED");
  });
});
