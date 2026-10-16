// mineclash #44: lokaler Stub der mineclash-API (nur Dev, In-Memory, kein
// Persist). Implementiert den Vertrag aus src/server/mineclash/MineclashApi.ts.
//
// Start:   npm run stub:api            (Port 8787 = jwtIssuer() bei DOMAIN=localhost)
// Spielserver gegen den Stub im Prod-Prüfpfad (JWT-Pflicht, keine persistentID):
//   MINECLASH_API_URL=http://localhost:8787 npm run start:server-dev
//   (API_KEY dort = API_KEY hier; start:server-dev setzt denselben Dev-Key)
// Token holen:  GET  /dev/login?name=Alice  => { token, uuid, name }
//               POST /auth/guest            => { token }
// Env: STUB_PORT (8787), STUB_ISSUER (http://localhost:<port>), DOMAIN (aud,
//   "localhost"), API_KEY, STUB_START_COINS (100000, Startguthaben je Konto).
import { uuidToBase64url } from "@openfront/shared/Base64";
import {
  exportJWK,
  generateKeyPair,
  jwtVerify,
  SignJWT,
  type CryptoKey,
} from "jose";
import { createHash, randomUUID } from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_RAKE_BPS,
  HeartbeatRequestSchema,
  HOLD_TTL_MS,
  HoldRequestSchema,
  minimalUserMe,
  ReleaseRequestSchema,
  ReportRequestSchema,
  ServerStartRequestSchema,
  SettleRequestSchema,
  type ReportRequest,
  type SettleRequest,
  type SettleResponse,
} from "../src/server/mineclash/MineclashApi";

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

interface Hold {
  match_id: string;
  uuid: string;
  coins: number;
  server_id: string;
  lastSeen: number;
  state: "held" | "released" | "expired" | "settled";
}

export interface LedgerEntry {
  ts: number;
  type: "stake" | "payout" | "burn";
  match_id: string;
  uuid: string | null;
  delta: number;
}

export class Ledger {
  readonly balances = new Map<string, number>();
  readonly holds = new Map<string, Hold>();
  readonly entries: LedgerEntry[] = [];
  burned = 0;
  readonly reports: ReportRequest[] = [];
  private readonly settles = new Map<
    string,
    { fingerprint: string; response: SettleResponse }
  >();
  private readonly settledMatches = new Set<string>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly startCoins = 100_000,
  ) {}

  /** #28: idempotent je (match_id, reporter, reported). */
  addReport(r: ReportRequest) {
    if (
      !this.reports.some(
        (x) =>
          x.match_id === r.match_id &&
          x.reporter === r.reporter &&
          x.reported === r.reported,
      )
    )
      this.reports.push(r);
  }

  /** Summe aller Konten (+ verbrannt = Startsumme). */
  total(): number {
    let t = 0;
    for (const b of this.balances.values()) t += b;
    return t;
  }

  balance(uuid: string) {
    this.sweep();
    if (!this.balances.has(uuid)) this.balances.set(uuid, this.startCoins);
    const balance = this.balances.get(uuid)!;
    let held = 0;
    for (const h of this.holds.values())
      if (h.uuid === uuid && h.state === "held") held += h.coins;
    return { uuid, balance, held, available: balance - held };
  }

  private key(match: string, uuid: string) {
    return `${match}|${uuid}`;
  }

  // 1 h ohne Lebenszeichen => Hold verfällt.
  private sweep() {
    const t = this.now();
    for (const h of this.holds.values())
      if (h.state === "held" && t - h.lastSeen > HOLD_TTL_MS)
        h.state = "expired";
  }

  hold(r: {
    match_id: string;
    uuid: string;
    coins: number;
    server_id: string;
  }) {
    const b = this.balance(r.uuid); // sweept
    if (this.settledMatches.has(r.match_id))
      throw new ApiError(409, "match_settled");
    const k = this.key(r.match_id, r.uuid);
    const old = this.holds.get(k);
    if (old?.state === "held") {
      if (old.coins !== r.coins) throw new ApiError(409, "hold_conflict");
      return { ok: true as const, replayed: true, ...pick(b) };
    }
    if (b.available < r.coins) throw new ApiError(402, "insufficient_funds");
    this.holds.set(k, { ...r, lastSeen: this.now(), state: "held" });
    const a = this.balance(r.uuid);
    return { ok: true as const, replayed: false, ...pick(a) };
  }

  release(r: { match_id: string; uuid: string }) {
    this.sweep();
    const h = this.holds.get(this.key(r.match_id, r.uuid));
    if (h?.state !== "held") return { ok: true as const, released: false };
    h.state = "released";
    return { ok: true as const, released: true };
  }

  heartbeat(r: { server_id: string; match_ids: string[] }) {
    this.sweep();
    for (const h of this.holds.values())
      if (
        h.state === "held" &&
        h.server_id === r.server_id &&
        r.match_ids.includes(h.match_id)
      )
        h.lastSeen = this.now();
    return { ok: true as const };
  }

  serverStart(r: { server_id: string; open_settle_match_ids: string[] }) {
    this.sweep();
    let released = 0;
    for (const h of this.holds.values())
      if (
        h.state === "held" &&
        h.server_id === r.server_id &&
        !r.open_settle_match_ids.includes(h.match_id)
      ) {
        h.state = "released";
        released++;
      }
    return { ok: true as const, released };
  }

  settle(req: SettleRequest): SettleResponse {
    this.sweep();
    const fingerprint = JSON.stringify(req);
    const prev = this.settles.get(req.event_id);
    if (prev) {
      if (prev.fingerprint !== fingerprint)
        throw new ApiError(409, "settle_conflict");
      return { ...prev.response, replayed: true };
    }
    if (this.settledMatches.has(req.match_id))
      throw new ApiError(409, "match_settled");

    const holds = [...this.holds.values()].filter(
      (h) => h.match_id === req.match_id && h.state === "held",
    );
    const pot = holds.reduce((s, h) => s + h.coins, 0);
    const payouts: { uuid: string; coins: number }[] = [];
    let burned = 0;
    const o = req.outcome;

    if (o.kind === "winners") {
      const byUuid = new Set(holds.map((h) => h.uuid));
      for (const w of o.winners)
        if (!byUuid.has(w.uuid)) throw new ApiError(422, "winner_not_held");
      if (new Set(o.winners.map((w) => w.uuid)).size !== o.winners.length)
        throw new ApiError(422, "duplicate_winner");
      const rake = Math.floor((pot * (o.rake_bps ?? DEFAULT_RAKE_BPS)) / 10000);
      const distributable = pot - rake;
      const parts = o.winners.reduce((s, w) => s + w.parts, 0);
      for (const w of o.winners)
        payouts.push({
          uuid: w.uuid,
          coins: Math.floor((distributable * w.parts) / parts),
        });
      burned = pot - payouts.reduce((s, p) => s + p.coins, 0);
      const t = this.now();
      for (const h of holds) {
        this.balances.set(h.uuid, this.balances.get(h.uuid)! - h.coins);
        this.entries.push({
          ts: t,
          type: "stake",
          match_id: h.match_id,
          uuid: h.uuid,
          delta: -h.coins,
        });
      }
      for (const p of payouts) {
        this.balances.set(p.uuid, this.balances.get(p.uuid)! + p.coins);
        this.entries.push({
          ts: t,
          type: "payout",
          match_id: req.match_id,
          uuid: p.uuid,
          delta: p.coins,
        });
      }
      this.entries.push({
        ts: t,
        type: "burn",
        match_id: req.match_id,
        uuid: null,
        delta: -burned,
      });
      this.burned += burned;
    }
    for (const h of holds) h.state = "settled";
    this.settledMatches.add(req.match_id);
    const response: SettleResponse = {
      ok: true,
      replayed: false,
      kind: o.kind,
      pot,
      burned,
      payouts,
    };
    this.settles.set(req.event_id, { fingerprint, response });
    return response;
  }
}

function pick(b: { balance: number; available: number }) {
  return { balance: b.balance, available: b.available };
}

/** Feste Test-UUID je Name (deterministisch). */
export function uuidForName(name: string): string {
  const h = createHash("sha256")
    .update("mineclash-stub:" + name)
    .digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export interface StubOptions {
  issuer: string;
  audience?: string;
  apiKey?: string;
  now?: () => number;
  startCoins?: number;
}

export async function createStub(opts: StubOptions) {
  const audience = opts.audience ?? "localhost";
  const apiKey = opts.apiKey ?? "WARNING_DEV_API_KEY_DO_NOT_USE_IN_PRODUCTION";
  const now = opts.now ?? Date.now;
  const ledger = new Ledger(now, opts.startCoins);
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
    crv: "Ed25519",
    extractable: true,
  });
  const jwk = { ...(await exportJWK(publicKey)), alg: "EdDSA" };

  async function sign(uuid: string, name: string, guest: boolean) {
    const iat = Math.floor(Date.now() / 1000); // echte Zeit (jose prüft exp)
    return new SignJWT({ name, ...(guest ? { guest: true } : {}) })
      .setProtectedHeader({ alg: "EdDSA" })
      .setJti(randomUUID())
      .setSubject(uuidToBase64url(uuid))
      .setIssuer(opts.issuer)
      .setAudience(audience)
      .setIssuedAt(iat)
      .setExpirationTime(iat + 24 * 3600)
      .sign(privateKey as CryptoKey);
  }

  async function route(
    req: http.IncomingMessage,
    url: URL,
  ): Promise<[number, unknown]> {
    const p = url.pathname;
    const m = req.method;
    if (p === "/.well-known/jwks.json") return [200, { keys: [jwk] }];
    if (p === "/dev/login" && m === "GET") {
      const name = url.searchParams.get("name");
      if (!name) throw new ApiError(400, "name_required");
      const uuid = uuidForName(name);
      return [200, { token: await sign(uuid, name, false), uuid, name }];
    }
    if (p === "/auth/guest" && m === "POST") {
      const id = randomUUID();
      return [200, { token: await sign(id, `Gast-${id.slice(0, 4)}`, true) }];
    }
    // Kein Server-Cluster: 404 = Seite nutzt ihre eigenen Werte (#52).
    if (p === "/cluster.json") throw new ApiError(404, "not_found");
    // Ab hier Server-zu-Server.
    if (req.headers["x-api-key"] !== apiKey)
      throw new ApiError(401, "bad_api_key");
    if (p === "/users/@me" && m === "GET") {
      const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
      if (!token) throw new ApiError(401, "no_token");
      try {
        const { payload } = await jwtVerify(token, publicKey, {
          algorithms: ["EdDSA"],
          issuer: opts.issuer,
          audience,
        });
        return [
          200,
          minimalUserMe(
            String(payload.sub).slice(0, 8),
            payload.guest ? null : String(payload.name),
          ),
        ];
      } catch {
        throw new ApiError(401, "bad_token");
      }
    }
    if (p === "/wallet/rate" && m === "GET")
      return [
        200,
        { wd_per_coin: 1000, day: new Date(now()).toISOString().slice(0, 10) },
      ];
    if (p === "/wallet/balance" && m === "GET") {
      const uuid = url.searchParams.get("uuid");
      if (!uuid) throw new ApiError(400, "uuid_required");
      return [200, ledger.balance(uuid)];
    }
    if (m === "POST" && p === "/reports") {
      const r = ReportRequestSchema.safeParse(JSON.parse(await readBody(req)));
      if (!r.success) throw new ApiError(400, "bad_request");
      ledger.addReport(r.data);
      return [200, { ok: true }];
    }
    if (m === "POST" && p.startsWith("/wallet/")) {
      let body: unknown;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        throw new ApiError(400, "bad_json");
      }
      const parse = <T>(s: {
        safeParse: (v: unknown) => { success: boolean; data?: T };
      }) => {
        const r = s.safeParse(body);
        if (!r.success) throw new ApiError(400, "bad_request");
        return r.data as T;
      };
      switch (p) {
        case "/wallet/hold":
          return [200, ledger.hold(parse(HoldRequestSchema))];
        case "/wallet/release":
          return [200, ledger.release(parse(ReleaseRequestSchema))];
        case "/wallet/settle":
          return [200, ledger.settle(parse(SettleRequestSchema))];
        case "/wallet/heartbeat":
          return [200, ledger.heartbeat(parse(HeartbeatRequestSchema))];
        case "/wallet/server-start":
          return [200, ledger.serverStart(parse(ServerStartRequestSchema))];
      }
    }
    throw new ApiError(404, "not_found");
  }

  const server = http.createServer((req, res) => {
    // Browser clients (guest JWT, cookie refresh) call this API cross-origin;
    // the real mineclash API needs the same CORS answer for play.mineclash.de.
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("access-control-allow-origin", origin);
      res.setHeader("access-control-allow-credentials", "true");
      res.setHeader("vary", "origin");
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers":
          req.headers["access-control-request-headers"] ?? "content-type",
      });
      res.end();
      return;
    }
    const url = new URL(req.url ?? "/", "http://stub");
    route(req, url)
      .catch((e): [number, unknown] => {
        if (e instanceof ApiError) return [e.status, { error: e.code }];
        console.error(e);
        return [500, { error: "internal" }];
      })
      .then(([status, body]) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      });
  });
  return { server, ledger };
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => resolve(s));
    req.on("error", reject);
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.STUB_PORT ?? 8787);
  const { server } = await createStub({
    issuer: process.env.STUB_ISSUER ?? `http://localhost:${port}`,
    audience: process.env.DOMAIN,
    apiKey: process.env.API_KEY,
    startCoins: process.env.STUB_START_COINS
      ? Number(process.env.STUB_START_COINS)
      : undefined,
  });
  server.listen(port, () =>
    console.log(`mineclash api stub on http://localhost:${port}`),
  );
}
