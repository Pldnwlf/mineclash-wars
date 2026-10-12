// mineclash #23/#31: Einsatz-Lobbys, Serverseite.
//
// - StakeLobby: Beitritts-Pruefungen + wallet.hold/release je Lobby
//   (match_id = gameID, uuid = JWT-sub). GameServer ruft nur diese Hooks.
// - Regeln-Zustimmung (#31) pro UUID dauerhaft in <MINECLASH_DATA_DIR>/rules-accepted.json.
// - validateStakeCreate: Pruefungen fuer POST /api/create_game mit mineclashStakeCoins.
// - IP-Hinweis fuer den Admin (#27/#30): geteilte IPs je Match in shared-ips.jsonl.
import { HumansVsNations } from "@openfront/engine-api/game/GameTypes";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "fs";
import path from "path";
import type { Client } from "../Client";
import { dataDir, toUuid } from "../MineclashReports";
import { isGuestClaims } from "./Identity";
import { MineclashApiError } from "./MineclashApi";
import type { MineclashWallet } from "./MineclashWallet";

/** Max. Konten pro IP je Einsatz-Lobby (#23, 2026-09-25). */
export const STAKE_MAX_ACCOUNTS_PER_IP = 2;

/** Ende-Minute fuer Custom-Einsatz-Lobbys ohne Zeitlimit (Schema-Maximum). */

export type StakeCode =
  | "stake_guest"
  | "stake_rules_not_accepted"
  | "stake_insufficient_funds"
  | "stake_ip_limit"
  | "stake_wallet_unavailable";

// ---- Regeln akzeptiert (#31) ----------------------------------------------

const rulesFile = () => path.join(dataDir(), "rules-accepted.json");

function readRules(): Record<string, number> {
  try {
    return JSON.parse(readFileSync(rulesFile(), "utf8"));
  } catch {
    return {};
  }
}

export function rulesAccepted(uuid: string): boolean {
  return uuid in readRules();
}

// ponytail: Datei je Aufruf lesen/schreiben; parallele Worker koennen eine
// gleichzeitige Zustimmung verlieren (Spieler klickt dann nochmal). DB sobald viele Konten.
export function acceptRules(uuid: string, now = Date.now()): void {
  const all = readRules();
  if (uuid in all) return;
  all[uuid] = now;
  mkdirSync(dataDir(), { recursive: true });
  const tmp = `${rulesFile()}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(all));
  renameSync(tmp, rulesFile());
}

// ---- Lobby: Beitritt, Hold ------------------------------------------------

const sharedIpsFile = () => path.join(dataDir(), "shared-ips.jsonl");

export class StakeLobby {
  constructor(
    readonly matchId: string,
    readonly coins: number,
    private readonly wallet: () => MineclashWallet | null,
  ) {}

  /** Sync-Pruefung vor dem Beitritt (nur Spieler, keine Zuschauer). */
  admit(client: Client, active: readonly Client[]): StakeCode | null {
    if (client.spectator) return null;
    if (client.claims === null || isGuestClaims(client.claims))
      return "stake_guest";
    if (!rulesAccepted(toUuid(client.persistentID)))
      return "stake_rules_not_accepted";
    if (!this.wallet()?.isReady()) return "stake_wallet_unavailable";
    const accounts = new Set(
      active
        .filter((c) => c.ip === client.ip && !c.spectator)
        .map((c) => c.persistentID),
    );
    accounts.add(client.persistentID);
    if (accounts.size > STAKE_MAX_ACCOUNTS_PER_IP) return "stake_ip_limit";
    return null;
  }

  /** Einsatz reservieren. null = ok, sonst Kick-Code. */
  async hold(persistentID: string): Promise<StakeCode | null> {
    const w = this.wallet();
    if (!w) return "stake_wallet_unavailable";
    try {
      await w.hold(this.matchId, toUuid(persistentID), this.coins);
      return null;
    } catch (e) {
      return e instanceof MineclashApiError && e.code === "insufficient_funds"
        ? "stake_insufficient_funds"
        : "stake_wallet_unavailable";
    }
  }

  isHeld(persistentID: string): boolean {
    return (
      toUuid(persistentID) in (this.wallet()?.stakesOf(this.matchId) ?? {})
    );
  }

  /** Verlassen/Kick vor dem Start. Offene Hold-Requests loest GameServer nach. */
  release(persistentID: string): Promise<void> {
    const u = toUuid(persistentID);
    if (!this.isHeld(persistentID)) return Promise.resolve();
    return this.wallet()!.release(this.matchId, u);
  }

  /** Start: Holds aller, die nicht mitspielen (z.B. im Prestart gegangen), frei. */
  async releaseExcept(players: readonly Client[]): Promise<void> {
    const playing = new Set(players.map((c) => toUuid(c.persistentID)));
    const w = this.wallet();
    if (!w) return;
    await Promise.all(
      Object.keys(w.stakesOf(this.matchId))
        .filter((u) => !playing.has(u))
        .map((u) => w.release(this.matchId, u)),
    );
  }

  releaseAll(): Promise<void> {
    return this.wallet()?.releaseAll(this.matchId) ?? Promise.resolve();
  }

  /** #27/#30: Konten, die sich eine IP teilen, pro Match protokollieren. */
  logSharedIps(players: readonly Client[]): void {
    const byIp = new Map<string, Set<string>>();
    for (const c of players) {
      const set = byIp.get(c.ip) ?? new Set();
      set.add(toUuid(c.persistentID));
      byIp.set(c.ip, set);
    }
    const shared = [...byIp].filter(([, s]) => s.size > 1);
    if (shared.length === 0) return;
    try {
      mkdirSync(dataDir(), { recursive: true });
      appendFileSync(
        sharedIpsFile(),
        shared
          .map(([ip, s]) =>
            JSON.stringify({
              match_id: this.matchId,
              ts: Date.now(),
              ip,
              uuids: [...s],
            }),
          )
          .join("\n") + "\n",
      );
    } catch {
      /* nur Hinweis, darf das Match nie stoeren */
    }
  }
}

// ---- create_game ------------------------------------------------------------

export interface StakeCreateInput {
  coins: unknown;
  claims: Client["claims"];
  persistentId: string;
  config:
    | {
        gameMode?: string;
        playerTeams?: unknown;
        hostCheats?: unknown;
        allowedPublicIds?: unknown[];
        infiniteGold?: boolean;
        infiniteTroops?: boolean;
      }
    | undefined;
  wallet: MineclashWallet | null;
  hostCheatsOn: boolean;
  /** Listing-Limits (ein Listing je Host, Cluster-Cap), als Fehlercode. */
  listingError: () => string | null;
}

/** HTTP-Status + Fehlercode oder die geprueften Coins. */
export async function validateStakeCreate(
  i: StakeCreateInput,
): Promise<{ coins: number } | { status: number; error: string }> {
  const err = (status: number, error: string) => ({ status, error });
  if (!Number.isSafeInteger(i.coins) || (i.coins as number) < 1)
    return err(400, "stake_invalid");
  const coins = i.coins as number;
  if (i.claims === null || isGuestClaims(i.claims))
    return err(403, "stake_guest");
  const uuid = toUuid(i.persistentId);
  if (!rulesAccepted(uuid)) return err(403, "stake_rules_not_accepted");
  if (!i.wallet?.isReady()) return err(503, "stake_wallet_unavailable");
  // Humans vs Nations nur ohne Einsatz (#9).
  if (i.config?.playerTeams === HumansVsNations)
    return err(400, "stake_humans_vs_nations");
  // Einsatz-Lobbys sind immer gelistet: wie beim Listing keine Host-Cheats/Whitelist.
  if (i.hostCheatsOn) return err(409, "stake_host_cheats");
  if ((i.config?.allowedPublicIds?.length ?? 0) > 0)
    return err(409, "stake_whitelist");
  const bal = await i.wallet.balanceOf(uuid);
  if (bal === null) return err(503, "stake_wallet_unavailable");
  if (coins > bal.available) return err(402, "stake_insufficient_funds");
  const l = i.listingError();
  if (l !== null) return err(409, l);
  return { coins };
}

// ---- GET /api/mineclash/status ---------------------------------------------

export async function statusResponse(
  wallet: MineclashWallet | null,
  login: { persistentId: string; claims: Client["claims"] } | null,
) {
  const ready = wallet?.isReady() ?? false;
  const user =
    login && login.claims !== null && !isGuestClaims(login.claims)
      ? toUuid(login.persistentId)
      : null;
  return {
    walletReady: ready,
    wdPerCoin: ready ? await wallet!.wdPerCoin() : null,
    rulesAccepted: user === null ? null : rulesAccepted(user),
    balance:
      user !== null && ready
        ? ((await wallet!.balanceOf(user))?.balance ?? null)
        : null,
  };
}
