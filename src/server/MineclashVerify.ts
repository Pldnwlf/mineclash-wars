// mineclash #24: binding match result. The clients' winner vote is only a
// cross-check; the money follows the server's own replay of the finished
// match (WinnerReplay.ts, low-priority child process, same code as the match).
// Any deviation or failure => refund of all stakes (no rake), see #25.
import { GameStartInfo, Winner } from "@openfront/engine-api/Schemas";
import type { ReplayedWinner } from "@openfront/engine/WinnerReplay";

export type RefundReason =
  | "no_human_winner" // nation/bot won, or all humans eliminated
  | "too_few_humans" // < 2 humans at start or < 2 spawned
  | "mismatch" // replay differs from recorded checksums or the clients' vote
  | "error" // replay crashed, timed out or named unknown players
  | "aborted"; // match ended without a result

export type MineclashResult =
  // notSpawned: humans who never spawned; they keep their stake.
  | {
      kind: "winners";
      clientIds: string[];
      team?: string;
      notSpawned?: string[];
    }
  | { kind: "refund"; reason: RefundReason };

// Receives the binding result once per match (later: #22/#42 settle).
export type MineclashResultHandler = (
  gameID: string,
  result: MineclashResult,
  ctx: {
    config: { mineclashStake?: { coins: number } };
    persistentIdOf: (clientId: string) => string | undefined;
  },
) => void;

const refund = (reason: RefundReason): MineclashResult => ({
  kind: "refund",
  reason,
});

const sameWinner = (a: Winner, b: Winner) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Pure decision. `replayed` is null when the replay failed. `voted` is the
// clients' majority winner (if any): it can only turn a result into a refund,
// never decide it.
export function mineclashResult(
  gameStart: GameStartInfo,
  replayed: ReplayedWinner | null,
  voted?: Winner,
  votedDecided = false,
): MineclashResult {
  const humans = new Set(gameStart.players.map((p) => p.clientID));
  if (humans.size < 2) return refund("too_few_humans");
  if (replayed === null) return refund("error");
  if ((replayed.firstHashMismatch ?? null) !== null) return refund("mismatch");
  const spawned = replayed.spawnedClientIds;
  const notSpawned = spawned
    ? [...humans].filter((id) => !spawned.includes(id))
    : [];
  if (humans.size - notSpawned.length < 2) return refund("too_few_humans");
  const w = replayed.winner;
  if (w === undefined) return refund("aborted");
  if (votedDecided && !sameWinner(voted, w)) return refund("mismatch");
  if (w[0] === "none" || w[0] === "nation") return refund("no_human_winner");
  const clientIds = (w[0] === "team" ? w.slice(2) : w.slice(1)) as string[];
  if (
    clientIds.length === 0 ||
    clientIds.some((id) => !humans.has(id) || notSpawned.includes(id))
  ) {
    return refund("error");
  }
  const extra = notSpawned.length > 0 ? { notSpawned } : {};
  return w[0] === "team"
    ? { kind: "winners", clientIds, team: w[1] as string, ...extra }
    : { kind: "winners", clientIds, ...extra };
}
