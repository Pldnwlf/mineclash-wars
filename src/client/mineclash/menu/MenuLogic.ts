// mineclash #19: pure logic of the main menu (no DOM), tested in
// tests/client/MineclashMenu.test.ts. Data interfaces for stake (#22/#23)
// and "Player of the day" live here too, until their sources exist.
import type {
  PublicGameInfo,
  PublicGames,
} from "@openfront/shared/WireSchemas";

// ---- join / glow toggle ----------------------------------------------------

export type CardClick =
  | { action: "join"; joined: string }
  | { action: "leave"; joined: null };

/** Click on a card: not in this lobby => join (also switches); in it => leave. */
export function toggleJoin(joined: string | null, gameID: string): CardClick {
  return joined === gameID
    ? { action: "leave", joined: null }
    : { action: "join", joined: gameID };
}

/** The joined lobby left the feed (started or cancelled) => no longer waiting. */
export function syncJoined(
  joined: string | null,
  activeIDs: readonly string[],
): string | null {
  return joined !== null && activeIDs.includes(joined) ? joined : null;
}

/** Reaction to the document's join-lobby event (source public) / leave-lobby. */
export function joinedFromEvent(
  source: string | undefined,
  gameID: string,
): string | null {
  return source === "public" ? gameID : null;
}

export const GLOW_CLASS = "ring-4 ring-mc shadow-[0_0_28px_var(--color-mc)]";
export const IDLE_CLASS = "border border-white/10 hover:border-mc/50";

export function glowClass(isJoined: boolean): string {
  return isJoined ? GLOW_CLASS : IDLE_CLASS;
}

// ---- lobby selection -------------------------------------------------------

function allLobbies(games: PublicGames["games"] | undefined) {
  return Object.values(games ?? {}).flat();
}

/** Rotation lobbies (mineclashRules) first, then any other public lobby. */
function firstPreferRotation(list: PublicGameInfo[]): PublicGameInfo | null {
  return (
    list.find((g) => g.gameConfig?.mineclashRules !== undefined) ??
    list[0] ??
    null
  );
}

/** Free card = public lobby without stake (rotation preferred). */
export function pickFreeLobby(
  games: PublicGames["games"] | undefined,
): PublicGameInfo | null {
  return firstPreferRotation(
    allLobbies(games).filter((g) => !g.gameConfig?.mineclashStake),
  );
}

/** mineclash #23: stake card = public lobby with mineclashStake. */
export function pickStakeLobby(
  games: PublicGames["games"] | undefined,
): PublicGameInfo | null {
  return firstPreferRotation(
    allLobbies(games).filter((g) => g.gameConfig?.mineclashStake),
  );
}

export function activeLobbyIDs(
  games: PublicGames["games"] | undefined,
): string[] {
  return Object.values(games ?? {})
    .flat()
    .map((g) => g.gameID);
}

/** Remaining share of the countdown ring, 0..1. */
export function ringFraction(remainingSec: number, totalSec: number): number {
  if (totalSec <= 0) return 0;
  return Math.min(1, Math.max(0, remainingSec / totalSec));
}

// ---- stake / rate (#23) ----------------------------------------------------

export interface StakeInfo {
  coins: number;
}

/** Stake of a lobby card, null = free. */
export function stakeOf(lobby: PublicGameInfo | null): StakeInfo | null {
  const c = lobby?.gameConfig?.mineclashStake?.coins;
  return c === undefined ? null : { coins: c };
}

/** Empty text of the stake card: wallet down vs. no lobby. */
export function stakeEmptyKey(walletReady: boolean | undefined): string {
  return walletReady === false
    ? "mineclash.stake_unavailable"
    : "mineclash.menu_no_stake_lobby";
}

/** 100 coins at 1000 => "$100K". */
export function formatUsd(coins: number, usdPerCoin: number | null): string {
  if (usdPerCoin === null) return "";
  const v = coins * usdPerCoin;
  if (v >= 1e6) return `$${+(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${+(v / 1e3).toFixed(1)}K`;
  return `$${Math.round(v)}`;
}

// ---- player of the day (interface until stats exist) -----------------------

export interface DayEntry {
  name: string;
  value: number;
}
export interface PlayerOfTheDay {
  mostWins: DayEntry | null;
  mostCoinsWon: DayEntry | null;
}

/** null = no data source yet; the component then shows the placeholder. */
export async function fetchPlayerOfTheDay(): Promise<PlayerOfTheDay | null> {
  return null;
}
