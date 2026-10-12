// mineclash #23: die zwei Rotationen. Einsatz = oeffentlicher Typ "ffa",
// Gratis = "special" (Namen aus OpenFront, beide spielen dieselben Regeln).
import type { GameMapType } from "@openfront/engine-api/game/GameTypes";
import type { GameConfig } from "@openfront/engine-api/Schemas";
import type { ScheduledPublicGameType } from "@openfront/shared/WireSchemas";
import type { MapPlaylist } from "../MapPlaylist";
import {
  DEFAULT_ROTATION_STAKE_DOLLARS,
  ROTATION_STAKE_DOLLARS,
} from "../MineclashMaps";
import type { MineclashWallet } from "./MineclashWallet";

export const STAKE_ROTATION: ScheduledPublicGameType = "ffa";
export const FREE_ROTATION: ScheduledPublicGameType = "special";

// Timer 20 s (kleine Karte) .. 90 s (grosse Karte), linear nach Max. Spielern.
export const TIMER_MIN_S = 20;
export const TIMER_MAX_S = 90;
const PLAYERS_MIN = 20; // kleinste Rotations-Karte
const PLAYERS_MAX = 55; // groesste Rotations-Karte

export function rotationTimerMs(maxPlayers: number | undefined): number {
  const p = Math.min(
    PLAYERS_MAX,
    Math.max(PLAYERS_MIN, maxPlayers ?? PLAYERS_MIN),
  );
  const s =
    TIMER_MIN_S +
    Math.floor(
      ((p - PLAYERS_MIN) * (TIMER_MAX_S - TIMER_MIN_S)) /
        (PLAYERS_MAX - PLAYERS_MIN),
    );
  return s * 1000;
}

/** Einsatz in ganzen Coins: Dollar zum Tageskurs, aufgerundet, min 1. */
export function stakeCoins(dollars: number, wdPerCoin: number): number {
  return Math.max(1, Math.ceil(dollars / wdPerCoin));
}

/**
 * Config fuer die naechste Rotations-Lobby. null = keine (Einsatz ohne
 * Wallet/Kurs: Gratis laeuft weiter).
 */
export async function rotationConfig(
  playlist: Pick<MapPlaylist, "gameConfig">,
  type: ScheduledPublicGameType,
  wallet: MineclashWallet | null,
): Promise<GameConfig | null> {
  const stake = type === STAKE_ROTATION;
  let coins = 0;
  let config: GameConfig;
  if (stake) {
    if (!wallet?.isReady()) return null;
    const wd = await wallet.wdPerCoin();
    if (wd === null) return null;
    config = await playlist.gameConfig(type);
    const dollars =
      ROTATION_STAKE_DOLLARS.get(config.gameMap as GameMapType) ??
      DEFAULT_ROTATION_STAKE_DOLLARS;
    coins = stakeCoins(dollars, wd);
  } else {
    // Gratis: gleiche Regeln, derselbe Karten-Pool/FFA-Config wie Einsatz.
    config = await playlist.gameConfig(STAKE_ROTATION);
  }
  // Trusted-only (OpenFront-Rotation) kennt mineclash nicht: niemand koennte beitreten.
  delete config.trusted;
  if (stake) config.mineclashStake = { coins };
  return config;
}
