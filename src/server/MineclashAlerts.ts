// mineclash #43: Alarme an die IT. Alles ueber env, nichts davon im Repo.
//
//   MINECLASH_KUMA_PUSH_URL      Push-URL des Uptime-Kuma-Monitors (ohne ?status=...).
//                                Gesetzt => Lebenszeichen "status=up", nur wenn der Server gesund ist.
//   MINECLASH_KUMA_PUSH_SECONDS  Push-Intervall in Sekunden (Default 60).
//   MINECLASH_ALERT_URL          Komplette Bridge-URL inkl. Token. Gesetzt => alert() sendet
//                                POST {"title","message"}. Ohne Variable passiert nichts.
//
// Titel ist stabil ("mineclash-wars: <key>", Doppel-Schluessel), Details gehen
// gekuerzt und von Personendaten/Secrets bereinigt in die message. Fehler werden
// nur geloggt, nie geworfen.
import { logger } from "./Logger";

const log = logger.child({ comp: "alerts" });

export const ALERT_MAX_MESSAGE = 500;
export const ALERT_RATE_LIMIT_MS = 10 * 60 * 1000;

export const ALERT_KEYS = {
  nachrechnung: "nachrechnung weicht ab", // #24
  auszahlung: "auszahlung haengt", // #42
  wallet: "wallet nicht erreichbar", // #22
  ledger: "ledger stimmt nicht", // #38
  drain: "drain haengt", // #41
} as const;

// UUIDs, IPs, Mails, URLs, lange Token/Hex-Strings und name=/user=-Paare raus.
export function sanitizeDetails(details: string): string {
  return details
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[mail]")
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      "[id]",
    )
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, "[ip]")
    .replace(
      /\b(name|user|username|player|uuid|ip|token)\s*[=:]\s*\S+/gi,
      "$1=[x]",
    )
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[x]")
    .slice(0, ALERT_MAX_MESSAGE);
}

const lastSent = new Map<string, number>();

export async function alert(key: string, details = ""): Promise<void> {
  const url = process.env.MINECLASH_ALERT_URL;
  if (!url) return;
  const now = Date.now();
  const prev = lastSent.get(key);
  if (prev !== undefined && now - prev < ALERT_RATE_LIMIT_MS) return;
  lastSent.set(key, now);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `mineclash-wars: ${key}`,
        message: sanitizeDetails(details),
      }),
    });
    if (!res.ok) log.warn(`alert "${key}" abgelehnt: HTTP ${res.status}`);
  } catch (e) {
    log.warn(`alert "${key}" fehlgeschlagen: ${(e as Error).message}`);
  }
}

export const alertNachrechnung = (d?: string) =>
  alert(ALERT_KEYS.nachrechnung, d);
export const alertAuszahlung = (d?: string) => alert(ALERT_KEYS.auszahlung, d);
export const alertWallet = (d?: string) => alert(ALERT_KEYS.wallet, d);
export const alertLedger = (d?: string) => alert(ALERT_KEYS.ledger, d);
export const alertDrain = (d?: string) => alert(ALERT_KEYS.drain, d);

/** Startet den Kuma-Push; null, wenn env nicht gesetzt. Rueckgabe = stop(). */
export function startKumaPush(isHealthy: () => boolean): (() => void) | null {
  const url = process.env.MINECLASH_KUMA_PUSH_URL;
  if (!url) return null;
  const secs = Number(process.env.MINECLASH_KUMA_PUSH_SECONDS);
  const every = (secs > 0 ? secs : 60) * 1000;
  const push = async () => {
    if (!isHealthy()) return;
    try {
      const res = await fetch(
        `${url}${url.includes("?") ? "&" : "?"}status=up&msg=OK`,
      );
      if (!res.ok) log.warn(`kuma-push: HTTP ${res.status}`);
    } catch (e) {
      log.warn(`kuma-push fehlgeschlagen: ${(e as Error).message}`);
    }
  };
  void push();
  const t = setInterval(push, every);
  t.unref();
  return () => clearInterval(t);
}

export function resetAlertsForTest() {
  lastSent.clear();
}
