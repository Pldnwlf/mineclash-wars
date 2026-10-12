// mineclash #28: Report nach dem Match. UI (Match-Historie) kommt in #40 und
// ruft nur diese Funktion auf.
import type { ReportReason } from "@openfront/shared/WireSchemas";
import { getAuthHeader } from "../Auth";
import { ClientEnv } from "../ClientEnv";

export type PostMatchReportResult =
  | "ok"
  | "duplicate"
  | "rate_limited"
  | "not_participant"
  | "not_found"
  | "error";

/** reported = UUIDs der gemeldeten Spieler, tick = Replay-Stelle (optional). */
export async function reportAfterMatch(
  matchId: string,
  reported: string[],
  reason: ReportReason,
  opts: { tick?: number; note?: string } = {},
): Promise<PostMatchReportResult> {
  const auth = await getAuthHeader();
  if (!auth) return "error";
  const res = await fetch(
    `${ClientEnv.gameHttpBase(matchId)}/${ClientEnv.gameWorkerPath(matchId)}/api/archive/${encodeURIComponent(matchId)}/report`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ reported, reason, ...opts }),
    },
  );
  if (res.ok) return "ok";
  if (res.status === 404) return "not_found";
  if (res.status === 403) return "not_participant";
  if (res.status === 409) return "duplicate";
  if (res.status === 429) return "rate_limited";
  return "error";
}
