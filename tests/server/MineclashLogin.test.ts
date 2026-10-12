// mineclash #21: JWT von mineclash, MC-Name im Match, Gast, postMessage-Origin.
// @vitest-environment node
import { uuidToBase64url } from "@openfront/shared/Base64";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { tokenFromMessage } from "../../src/client/mineclash/Login";
import { verifyClientToken } from "../../src/server/jwt";
import { mineclashIdentity } from "../../src/server/mineclash/Identity";

const ISS = "http://mc-api.test";
process.env.DOMAIN = "localhost";
process.env.MINECLASH_API_URL = ISS;

let priv: CryptoKey;
const uuid = randomUUID();

function sign(
  extra: Record<string, unknown> = {},
  o: { iss?: string; aud?: string } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(extra)
    .setProtectedHeader({ alg: "EdDSA" })
    .setJti(randomUUID())
    .setSubject(uuidToBase64url(uuid))
    .setIssuer(o.iss ?? ISS)
    .setAudience(o.aud ?? "localhost")
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(priv);
}

beforeAll(async () => {
  const kp = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  priv = kp.privateKey as CryptoKey;
  const jwk = { ...(await exportJWK(kp.publicKey)), alg: "EdDSA" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ keys: [jwk] })),
  );
});
afterAll(() => vi.unstubAllGlobals());

describe("verifyClientToken (Prod-Pfad gegen mineclash)", () => {
  test("gültiges Token: UUID + MC-Name", async () => {
    const r = await verifyClientToken(await sign({ name: "Alice" }));
    expect(r.type).toBe("success");
    if (r.type !== "success") return;
    expect(r.persistentId).toBe(uuid);
    expect(r.claims?.name).toBe("Alice");
    expect(r.claims?.guest).toBeUndefined();
  });
  test("falsche iss / aud werden abgelehnt", async () => {
    const badIss = await verifyClientToken(
      await sign({ name: "A" }, { iss: "https://api.openfront.io" }),
    );
    const badAud = await verifyClientToken(
      await sign({ name: "A" }, { aud: "openfront.io" }),
    );
    expect(badIss.type).toBe("error");
    expect(badAud.type).toBe("error");
  });
  test("role banned kommt in den Claims an (Worker kickt)", async () => {
    const r = await verifyClientToken(
      await sign({ name: "A", role: "banned" }),
    );
    expect(r.type === "success" && r.claims?.role).toBe("banned");
  });
  test("Gast-JWT: guest=true", async () => {
    const r = await verifyClientToken(
      await sign({ name: "Gast-1", guest: true }),
    );
    expect(r.type === "success" && r.claims?.guest).toBe(true);
  });
  test("bare persistentID ist mit MINECLASH_API_URL nicht erlaubt", async () => {
    expect((await verifyClientToken(randomUUID())).type).toBe("error");
  });
});

describe("mineclashIdentity", () => {
  const claims = (extra: object) =>
    ({ name: "Alice", ...extra }) as Parameters<typeof mineclashIdentity>[0];
  test("eingeloggt: immer MC-Name, kein Clan-Tag", () => {
    expect(mineclashIdentity(claims({}), "Hacker", "TAG")).toEqual({
      username: "Alice",
      clanTag: null,
    });
  });
  test("Gast und anonym: freier Name bleibt", () => {
    expect(mineclashIdentity(claims({ guest: true }), "Frei", "T")).toEqual({
      username: "Frei",
      clanTag: "T",
    });
    expect(mineclashIdentity(null, "Frei", null)).toEqual({
      username: "Frei",
      clanTag: null,
    });
  });
});

describe("postMessage-Origin", () => {
  const msg = { type: "mineclash-login", token: "abc" };
  test("erlaubte Origin => Token", () => {
    expect(
      tokenFromMessage({ origin: "https://mineclash.de", data: msg }),
    ).toBe("abc");
  });
  test("fremde / ähnliche Origin => null", () => {
    for (const origin of [
      "https://evil.example",
      "https://mineclash.de.evil.example",
      "http://mineclash.de",
      "https://www.mineclash.de",
    ])
      expect(tokenFromMessage({ origin, data: msg })).toBeNull();
  });
  test("konfigurierbare Origin; falscher Typ/Token => null", () => {
    expect(
      tokenFromMessage(
        { origin: "http://localhost:5173", data: msg },
        "http://localhost:5173",
      ),
    ).toBe("abc");
    expect(
      tokenFromMessage({
        origin: "https://mineclash.de",
        data: { type: "x", token: "t" },
      }),
    ).toBeNull();
    expect(
      tokenFromMessage({
        origin: "https://mineclash.de",
        data: { type: "mineclash-login", token: 1 },
      }),
    ).toBeNull();
  });
});
