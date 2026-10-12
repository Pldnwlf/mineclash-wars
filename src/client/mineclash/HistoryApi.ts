// mineclash #40: eigene Matches vom Spielserver (GET /api/history, JWT).
import { getAuthHeader } from "../Auth";
import { ClientEnv } from "../ClientEnv";

export type HistoryEntry = {
  id: string;
  end: number;
  map: string;
  mode: string;
  type: string;
  result: "won" | "lost" | "none" | "unfinished";
  playerCount: number;
  stake: boolean;
  players: { uuid: string; name: string }[];
  // Gefuellt mit #22/#23/#39.
  stakeCoins?: number;
  netCoins?: number;
  payoutStatus?: string;
};

/** null = nicht eingeloggt / Gast / Fehler. */
export async function fetchHistory(): Promise<HistoryEntry[] | null> {
  const auth = await getAuthHeader();
  if (!auth) return null;
  // Egal welcher Worker: alle teilen MINECLASH_DATA_DIR.
  const res = await fetch(
    `${ClientEnv.gameHttpBase("history")}/${ClientEnv.gameWorkerPath("history")}/api/history`,
    { headers: { Authorization: auth } },
  );
  if (!res.ok) return null;
  return ((await res.json()) as { matches: HistoryEntry[] }).matches;
}
