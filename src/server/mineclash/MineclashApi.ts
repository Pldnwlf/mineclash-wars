// mineclash #44: VERTRAG zwischen Spielserver und mineclash-API.
// Gegenstück: Pldnwlf/mineflayer#27 (JWT/JWKS) und #28 (Wallet). Der lokale
// Stub (scripts/mineclash-api-stub.ts) und die echte API implementieren
// exakt diese Pfade + Schemas; später wird nur MINECLASH_API_URL getauscht.
// Aufrufer: #21 (Login), #22/#23 (Wallet/Einsatz-Lobbys), #42 (Settle-Retry).
//
// Basis-URL = ServerEnv.jwtIssuer() (= MINECLASH_API_URL, falls gesetzt).
//
// ── Auth ────────────────────────────────────────────────────────────────
// Spieler-JWT (von mineclash ausgegeben, vom Spielserver in jwt.ts geprüft):
//   Signatur EdDSA (Ed25519); JWKS: GET /.well-known/jwks.json, keys[0]
//   (alg "EdDSA", crv "Ed25519", kty "OKP", x).
//   iss = Basis-URL exakt, aud = ServerEnv.jwtAudience() (DOMAIN),
//   sub = Mojang-UUID als base64url (uuidToBase64url, nie mit Bindestrichen),
//   jti, iat, exp, role? ("banned" => Kick), name = MC-Name (Extra-Claim,
//   steht im Match immer; nicht änderbar), guest? = true bei Gast-JWT.
// Gast-JWT: POST /auth/guest => { token }; sub = zufällige UUID, guest=true.
//   Gäste dürfen nur Gratis-Lobbys (kein hold).
// GET /cluster.json?site=… (öffentlich, vom Browser gepollt) => 404: es gibt
//   keine Serverliste, der Client nutzt die Werte der Seite (#52).
// Server-zu-Server (alles unter /wallet/*, GET /users/@me): Header
//   `x-api-key: <ServerEnv.apiKey()>`. Kein Client-Zugriff.
//   /users/@me zusätzlich `authorization: Bearer <JWT>`; Antwort muss
//   UserMeResponseSchema (src/core/ApiSchemas.ts) erfüllen.
//
// ── Wallet (Coins = ganze Zahlen, nie Floats) ───────────────────────────
// Fehler: HTTP 4xx, Body { error: <code> }.
//   POST /wallet/hold      HoldRequest      => HoldResponse
//   POST /wallet/release   ReleaseRequest   => ReleaseResponse
//   POST /wallet/settle    SettleRequest    => SettleResponse
//   POST /wallet/heartbeat HeartbeatRequest => { ok: true }
//   POST /wallet/server-start ServerStartRequest => { ok, released }
//   GET  /wallet/rate                       => RateResponse
//   GET  /wallet/balance?uuid=<uuid>        => BalanceResponse
//   POST /reports          ReportRequest    => { ok: true }  (#28, x-api-key)
//
// hold: reserviert Coins (nicht weg, nicht auszahlbar, nicht doppelt
//   setzbar). Idempotent je (match_id, uuid): gleicher Betrag => Replay,
//   anderer Betrag => 409 hold_conflict. Nach release/Ablauf neu holdbar.
//   402 insufficient_funds, 409 match_settled.
// release: gibt den Hold frei; ohne aktiven Hold ein No-op (idempotent).
// settle: Spielserver meldet das Ergebnis NACH der Nachrechnung (#24).
//   event_id = Match-ID (#42) => doppelte Aufrufe liefern die gespeicherte
//   Antwort (replayed=true); gleiche event_id mit anderem Inhalt => 409
//   settle_conflict. Topf = Summe aller aktiven Holds des Matches.
//   kind "winners": Rake = floor(Topf*rake_bps/10000) (Default 500 = 5 %,
//     verbrannt). Rest wird nach `parts` auf die Gewinner verteilt (Gleichstand
//     und Teams: alle parts=1), je floor; der Rundungsrest wird mit der Rake
//     verbrannt. Gewinner müssen Holds im Match haben (422 winner_not_held).
//     Verlierer werden ihren Einsatz los, Gewinner erhalten ihren Anteil.
//   kind "refund": alle Einsätze frei, keine Rake (Abbruch, <2 Menschen,
//     Nationen-Sieg, Nachrechnung weicht ab).
// heartbeat: Spielserver meldet regelmässig seine laufenden Matches. Ein Hold
//   verfällt 1 h nach dem letzten Lebenszeichen (Hold-Zeitpunkt oder
//   Heartbeat). Matches mit offenem Settle (#42) MÜSSEN weiter gemeldet werden.
// server-start: Neustart-Freigabe. Gibt alle Holds dieses server_id frei,
//   AUSSER Holds von `open_settle_match_ids` (persistierte, noch nicht
//   bestätigte Settles, #42). Erst danach darf der Server neue Holds setzen.
// rate: Tageskurs, live Sparbuch-Kurs, 1x täglich: wd_per_coin = W$ je Coin.
//   Einsatz ist in Coins fix; $-Anzeige = coins * wd_per_coin.
// balance: balance (Coins) = held + available.

import { z } from "zod";

export const MatchIdSchema = z.string().min(1).max(64);
export const UuidSchema = z.uuid();
export const CoinsSchema = z.int().min(1).max(1_000_000_000_000);

export const HoldRequestSchema = z.object({
  match_id: MatchIdSchema,
  uuid: UuidSchema,
  coins: CoinsSchema,
  server_id: z.string().min(1).max(64),
});
export type HoldRequest = z.infer<typeof HoldRequestSchema>;

export const HoldResponseSchema = z.object({
  ok: z.literal(true),
  replayed: z.boolean(),
  balance: z.int(),
  available: z.int(),
});
export type HoldResponse = z.infer<typeof HoldResponseSchema>;

export const ReleaseRequestSchema = z.object({
  match_id: MatchIdSchema,
  uuid: UuidSchema,
});
export type ReleaseRequest = z.infer<typeof ReleaseRequestSchema>;

export const ReleaseResponseSchema = z.object({
  ok: z.literal(true),
  released: z.boolean(),
});
export type ReleaseResponse = z.infer<typeof ReleaseResponseSchema>;

export const RefundReasonSchema = z.enum([
  "aborted",
  "too_few_humans",
  "nations_won",
  "recount_mismatch",
]);
export type RefundReason = z.infer<typeof RefundReasonSchema>;

export const SettleRequestSchema = z.object({
  event_id: z.string().min(1).max(64),
  match_id: MatchIdSchema,
  outcome: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("winners"),
      winners: z
        .array(z.object({ uuid: UuidSchema, parts: z.int().min(1).max(1000) }))
        .min(1),
      rake_bps: z.int().min(0).max(10000).optional(),
    }),
    z.object({ kind: z.literal("refund"), reason: RefundReasonSchema }),
  ]),
});
export type SettleRequest = z.infer<typeof SettleRequestSchema>;

export const SettleResponseSchema = z.object({
  ok: z.literal(true),
  replayed: z.boolean(),
  kind: z.enum(["winners", "refund"]),
  pot: z.int(),
  // Verbrannt = Rake + Rundungsrest (0 bei refund).
  burned: z.int(),
  payouts: z.array(z.object({ uuid: UuidSchema, coins: z.int() })),
});
export type SettleResponse = z.infer<typeof SettleResponseSchema>;

export const HeartbeatRequestSchema = z.object({
  server_id: z.string().min(1).max(64),
  match_ids: z.array(MatchIdSchema),
});
export type HeartbeatRequest = z.infer<typeof HeartbeatRequestSchema>;

export const ServerStartRequestSchema = z.object({
  server_id: z.string().min(1).max(64),
  open_settle_match_ids: z.array(MatchIdSchema).default([]),
});
export type ServerStartRequest = z.input<typeof ServerStartRequestSchema>;

export const ServerStartResponseSchema = z.object({
  ok: z.literal(true),
  released: z.int(),
});
export type ServerStartResponse = z.infer<typeof ServerStartResponseSchema>;

export const RateResponseSchema = z.object({
  wd_per_coin: z.int().min(1),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type RateResponse = z.infer<typeof RateResponseSchema>;

export const BalanceResponseSchema = z.object({
  uuid: UuidSchema,
  balance: z.int(),
  held: z.int(),
  available: z.int(),
});
export type BalanceResponse = z.infer<typeof BalanceResponseSchema>;

export const GuestTokenResponseSchema = z.object({ token: z.string() });

// #28: POST /reports (Server-zu-Server). Idempotent je (match_id, reporter,
// reported). tick = Match-Tick (Replay-Stelle), null = unbekannt.
export const ReportRequestSchema = z.object({
  match_id: MatchIdSchema,
  reporter: z.string().min(1).max(64), // Melder-UUID
  reported: z.string().min(1).max(64), // gemeldete UUID
  reason: z.enum(["botting", "teaming", "inappropriate_username", "griefing"]),
  tick: z.int().min(0).nullable(),
  ts: z.int().min(0), // Unix-ms der Meldung
  note: z.string().max(500).optional(),
  source: z.enum(["match", "post_match"]),
});
export type ReportRequest = z.infer<typeof ReportRequestSchema>;

export const ApiErrorSchema = z.object({ error: z.string() });

export const HOLD_TTL_MS = 60 * 60 * 1000;
export const DEFAULT_RAKE_BPS = 500;

export class MineclashApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`mineclash api ${status} ${code}`);
  }
}

/** Minimal /users/@me, gültig gegen UserMeResponseSchema. */
export function minimalUserMe(publicId: string, name: string | null) {
  return {
    user: {},
    player: {
      publicId,
      adfree: false,
      unlimitedRanked: false,
      canCreatePublicLobbies: true,
      flares: [] as string[],
      achievements: { singleplayerMap: [] },
      friends: [] as string[],
      subscription: null,
      username: name,
      usernameBase: name,
    },
  };
}

/** Typisierter Client für den Spielserver. */
export class MineclashApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async call<T>(
    method: "GET" | "POST",
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    const res = await this.fetchFn(this.baseUrl.replace(/\/$/, "") + path, {
      method,
      headers: {
        "x-api-key": this.apiKey,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = ApiErrorSchema.safeParse(json);
      throw new MineclashApiError(
        res.status,
        err.success ? err.data.error : "unknown",
      );
    }
    return schema.parse(json);
  }

  hold(req: HoldRequest) {
    return this.call("POST", "/wallet/hold", HoldResponseSchema, req);
  }
  release(req: ReleaseRequest) {
    return this.call("POST", "/wallet/release", ReleaseResponseSchema, req);
  }
  settle(req: SettleRequest) {
    return this.call("POST", "/wallet/settle", SettleResponseSchema, req);
  }
  heartbeat(req: HeartbeatRequest) {
    return this.call(
      "POST",
      "/wallet/heartbeat",
      z.object({ ok: z.literal(true) }),
      req,
    );
  }
  serverStart(req: ServerStartRequest) {
    return this.call(
      "POST",
      "/wallet/server-start",
      ServerStartResponseSchema,
      req,
    );
  }
  report(req: ReportRequest) {
    return this.call(
      "POST",
      "/reports",
      z.object({ ok: z.literal(true) }),
      req,
    );
  }
  rate() {
    return this.call("GET", "/wallet/rate", RateResponseSchema);
  }
  balance(uuid: string) {
    return this.call(
      "GET",
      `/wallet/balance?uuid=${encodeURIComponent(uuid)}`,
      BalanceResponseSchema,
    );
  }
}
