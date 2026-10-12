// mineclash #28: Spieler-Reports dauerhaft speichern (JSONL in
// MINECLASH_DATA_DIR) und, falls MINECLASH_API_URL gesetzt ist, an die
// mineclash-API weiterleiten (POST /reports, Admin-Panel #30 liest dort).
import { base64urlToUuid } from "@openfront/shared/Base64";
import { ReportReasonSchema } from "@openfront/shared/WireSchemas";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import {
  MineclashApiClient,
  ReportRequest,
  ReportRequestSchema,
} from "./mineclash/MineclashApi";
import { ServerEnv } from "./ServerEnv";

export const REPORT_LIMIT_PER_HOUR = 10;
const HOUR_MS = 3600 * 1000;

// Body fuer den Nach-Match-Report (Melder kommt aus dem JWT).
export const PostMatchReportBodySchema = z.object({
  reported: z.array(z.string().min(1).max(64)).min(1).max(10),
  reason: ReportReasonSchema,
  tick: z.int().min(0).optional(),
  note: z.string().max(500).optional(),
});

export type ReportResult = "ok" | "duplicate" | "rate_limited";

export function dataDir(): string {
  return process.env.MINECLASH_DATA_DIR ?? "./data";
}
const reportsFile = () => path.join(dataDir(), "reports.jsonl");

// JWT-sub (base64url) oder schon eine UUID => UUID.
export function toUuid(persistentId: string): string {
  if (persistentId.includes("-")) return persistentId;
  try {
    return base64urlToUuid(persistentId);
  } catch {
    return persistentId;
  }
}

// Report nach dem Match (POST /api/archive/:id/report). Nur Teilnehmer des
// noch vorhandenen Records; Melder = JWT-sub. Rueckgabe = HTTP-Status + Body.
export async function postMatchReport(
  record: any,
  reporterPersistentId: string,
  rawBody: unknown,
): Promise<{ status: number; body: { ok?: true; error?: string } }> {
  const body = PostMatchReportBodySchema.safeParse(rawBody);
  if (!body.success) return { status: 400, body: { error: "bad_request" } };
  const players: any[] = record.info.players;
  const reporter = toUuid(reporterPersistentId);
  const inMatch = new Set(players.map((p) => toUuid(p.persistentID ?? "")));
  if (!inMatch.has(reporter))
    return { status: 403, body: { error: "not_participant" } };
  const targets = [...new Set(body.data.reported.map(toUuid))];
  if (targets.some((t) => t === reporter || !inMatch.has(t)))
    return { status: 400, body: { error: "bad_target" } };
  if (body.data.tick !== undefined && body.data.tick > record.info.num_turns)
    return { status: 400, body: { error: "bad_tick" } };
  let done = 0;
  for (const reported of targets) {
    const res = await submitReport({
      match_id: record.info.gameID,
      reporter,
      reported,
      reason: body.data.reason,
      tick: body.data.tick ?? null,
      note: body.data.note,
      source: "post_match",
    });
    if (res === "rate_limited")
      return { status: 429, body: { error: "rate_limited" } };
    if (res === "ok") done++;
  }
  if (done === 0) return { status: 409, body: { error: "duplicate" } };
  return { status: 200, body: { ok: true } };
}

export async function readReports(): Promise<ReportRequest[]> {
  let text: string;
  try {
    text = await fs.readFile(reportsFile(), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => ReportRequestSchema.parse(JSON.parse(l)));
}

// Einmal je (Match, Melder, Gemeldeter); max. 10/h je Melder.
// ponytail: liest die Datei je Report; bei Tausenden Reports Index/DB nutzen.
// Parallele Worker koennen das Limit um 1-2 ueberschreiten (kein Lock).
export async function submitReport(
  r: Omit<ReportRequest, "ts">,
  now = Date.now(),
): Promise<ReportResult> {
  const all = await readReports();
  if (
    all.some(
      (x) =>
        x.match_id === r.match_id &&
        x.reporter === r.reporter &&
        x.reported === r.reported,
    )
  )
    return "duplicate";
  if (
    all.filter((x) => x.reporter === r.reporter && now - x.ts < HOUR_MS)
      .length >= REPORT_LIMIT_PER_HOUR
  )
    return "rate_limited";
  const rec = ReportRequestSchema.parse({ ...r, ts: now });
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.appendFile(reportsFile(), JSON.stringify(rec) + "\n");
  forward(rec);
  return "ok";
}

function forward(rec: ReportRequest) {
  const url = ServerEnv.mineclashApiUrl();
  if (!url) return;
  new MineclashApiClient(url, ServerEnv.apiKey())
    .report(rec)
    .catch((e) => console.error(`report forward failed: ${e}`));
}
