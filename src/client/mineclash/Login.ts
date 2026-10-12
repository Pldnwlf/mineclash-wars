// mineclash #21: Login wird von mineclash.de übernommen, kein zweiter Login.
// Reihenfolge: (1) Dev: ?devLogin=Name (Stub), (2) Token per postMessage vom
// iframe-Parent (strikte Origin-Prüfung), (3) Cookie-Session auf .mineclash.de
// (POST /auth/refresh mit credentials, Antwort { jwt, expiresIn }), (4) Gast-JWT
// (POST /auth/guest). Server prüft die Signatur; hier nur Transport.
import { decodeJwt } from "jose";

export const LOGIN_MESSAGE = "mineclash-login";
export const LOGIN_REQUEST = "mineclash-login-request";
const PARENT_WAIT_MS = 1500;

export type Session = { jwt: string; expiresIn: number };

export function mineclashLoginOrigin(): string {
  const o = process.env.MINECLASH_LOGIN_ORIGIN ?? "";
  if (o.length > 0) return o;
  return "https://mineclash.de";
}

/** Token aus einer postMessage, nur von der erlaubten Origin. */
export function tokenFromMessage(
  ev: { origin: string; data: unknown },
  allowedOrigin: string = mineclashLoginOrigin(),
): string | null {
  if (ev.origin !== allowedOrigin) return null;
  const d = ev.data as { type?: unknown; token?: unknown } | null;
  if (d?.type !== LOGIN_MESSAGE || typeof d.token !== "string") return null;
  return d.token;
}

function sessionFromJwt(jwt: string): Session | null {
  try {
    const { exp } = decodeJwt(jwt);
    if (typeof exp !== "number") return null;
    const expiresIn = exp - Math.floor(Date.now() / 1000);
    return expiresIn > 0 ? { jwt, expiresIn } : null;
  } catch {
    return null;
  }
}

function fromParent(origin: string): Promise<Session | null> {
  if (typeof window === "undefined" || window.parent === window) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const done = (s: Session | null) => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(s);
    };
    const onMessage = (ev: MessageEvent) => {
      const token = tokenFromMessage(ev, origin);
      const s = token ? sessionFromJwt(token) : null;
      if (s) done(s);
    };
    const timer = setTimeout(() => done(null), PARENT_WAIT_MS);
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: LOGIN_REQUEST }, origin);
  });
}

async function post(url: string, credentials?: RequestCredentials) {
  try {
    const res = await fetch(url, {
      method: "POST",
      credentials,
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function acquireSession(
  apiBase: string,
  isDev: boolean,
): Promise<Session | null> {
  if (isDev) {
    const name = new URLSearchParams(location.search).get("devLogin");
    if (name) {
      try {
        const res = await fetch(
          `${apiBase}/dev/login?name=${encodeURIComponent(name)}`,
        );
        const token = res.ok
          ? ((await res.json()) as { token?: string })
          : null;
        const s = token?.token ? sessionFromJwt(token.token) : null;
        if (s) return s;
      } catch {
        // fall through to the normal chain
      }
    }
  }
  const parent = await fromParent(mineclashLoginOrigin());
  if (parent) return parent;

  const cookie = await post(`${apiBase}/auth/refresh`, "include");
  if (typeof cookie?.jwt === "string") {
    const s = sessionFromJwt(cookie.jwt);
    if (s) return s;
  }
  const guest = await post(`${apiBase}/auth/guest`);
  return typeof guest?.token === "string" ? sessionFromJwt(guest.token) : null;
}
