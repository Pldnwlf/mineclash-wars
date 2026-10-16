// mineclash #23: client side of the stake lobbies. All server calls (contract
// CONTRACT-23) live here so they can be tested with a mocked fetch.
import { getAuthHeader } from "../Auth";
import { ClientEnv } from "../ClientEnv";
import { translateText } from "../Utils";

export type StakeStatus = {
  walletReady: boolean;
  /** In-game money (WD) per coin. null = unknown. */
  wdPerCoin: number | null;
  /** null = not logged in / guest. */
  rulesAccepted: boolean | null;
  balance: number | null;
  /** balance minus coins held in stake lobbies. */
  available?: number | null;
};

/** kick_reason.<code>: texts are owned by the server side (en/de). */
export const STAKE_CODES = [
  "stake_guest",
  "stake_rules_not_accepted",
  "stake_insufficient_funds",
  "stake_ip_limit",
  "stake_wallet_unavailable",
] as const;

export function stakeErrorText(code: string): string {
  const c = code.replace(/^kick_reason\./, "");
  return (STAKE_CODES as readonly string[]).includes(c)
    ? translateText(`kick_reason.${c}`)
    : translateText("mineclash.stake_error", { code: c });
}

/** Join error from the socket ("kick_reason.stake_*") => text, else null. */
export function stakeKickText(error: string): string | null {
  return error.startsWith("kick_reason.stake_") ? stakeErrorText(error) : null;
}

function url(path: string): string {
  return `${ClientEnv.gameHttpBase("history")}/${ClientEnv.gameWorkerPath("history")}${path}`;
}

async function headers(): Promise<Record<string, string>> {
  const auth = await getAuthHeader();
  return auth ? { Authorization: auth } : {};
}

let lastRate: number | null = null;
/** Rate of the last status fetch (menu loads it), for panels that render sync. */
export function cachedRate(): number | null {
  return lastRate;
}

/** null = server unreachable. */
export async function fetchStakeStatus(): Promise<StakeStatus | null> {
  try {
    const res = await fetch(url("/api/mineclash/status"), {
      headers: await headers(),
    });
    if (!res.ok) return null;
    const s = (await res.json()) as StakeStatus;
    lastRate = s.wdPerCoin;
    return s;
  } catch {
    return null;
  }
}

export async function acceptRules(): Promise<boolean> {
  try {
    const res = await fetch(url("/api/mineclash/rules-accept"), {
      method: "POST",
      headers: await headers(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---- join gate -------------------------------------------------------------

export type GateResult =
  | { ok: true }
  | { ok: false; reason: "unavailable" | "login" | "rules" | "funds" };

/** Pure check before joining a stake lobby with `coins` stake. */
export function stakeGate(s: StakeStatus | null, coins: number): GateResult {
  if (s === null || !s.walletReady) return { ok: false, reason: "unavailable" };
  if (s.balance === null || s.rulesAccepted === null) {
    return { ok: false, reason: "login" };
  }
  if (!s.rulesAccepted) return { ok: false, reason: "rules" };
  if ((s.available ?? s.balance) < coins) return { ok: false, reason: "funds" };
  return { ok: true };
}

const GATE_TEXT = {
  unavailable: "mineclash.stake_unavailable",
  login: "mineclash.stake_login_required",
  funds: "mineclash.stake_not_enough",
  rules: "mineclash.stake_unavailable",
} as const;

/**
 * Everything before the first stake join: status, login hint, rules popup
 * (+ POST rules-accept), balance hint. true = go ahead and join.
 */
export async function runStakeJoinGate(
  coins: number,
  ui: { showRules: () => Promise<boolean>; notify: (text: string) => void },
): Promise<boolean> {
  let status = await fetchStakeStatus();
  let g = stakeGate(status, coins);
  if (!g.ok && g.reason === "rules" && status) {
    if (!(await ui.showRules()) || !(await acceptRules())) return false;
    status = { ...status, rulesAccepted: true };
    g = stakeGate(status, coins);
  }
  if (g.ok) return true;
  ui.notify(translateText(GATE_TEXT[g.reason], { coins }));
  return false;
}

/** Shows <rules-popup>; resolves true on "Accept", false on cancel. */
export function showRulesPopup(): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement("rules-popup") as HTMLElement & {
      onAccept: () => void;
      onCancel: () => void;
      show: () => void;
    };
    const done = (v: boolean) => {
      el.remove();
      resolve(v);
    };
    el.onAccept = () => done(true);
    el.onCancel = () => done(false);
    document.body.appendChild(el);
    el.show();
  });
}

export function toast(text: string, color = "red") {
  window.dispatchEvent(
    new CustomEvent("show-message", {
      detail: { message: text, color, duration: 5000 },
    }),
  );
}

// ---- money input -----------------------------------------------------------

/**
 * "100" => 100 coins. "15m" / "10k" / "$2.5m" / "$500" => money amount,
 * converted at `wdPerCoin` and rounded up. null = invalid.
 */
export function parseStakeInput(
  text: string,
  wdPerCoin: number | null,
): number | null {
  const m = /^(\$?)\s*(\d+(?:[.,]\d+)?)\s*([kmb]?)$/i.exec(text.trim());
  if (!m) return null;
  const n = Number(m[2].replace(",", "."));
  const mult = { "": 1, k: 1e3, m: 1e6, b: 1e9 }[m[3].toLowerCase()] ?? 1;
  const isMoney = m[1] === "$" || m[3] !== "";
  let coins = n * mult;
  if (isMoney) {
    if (wdPerCoin === null || wdPerCoin <= 0) return null;
    coins = Math.ceil(coins / wdPerCoin - 1e-9);
  } else if (!Number.isInteger(coins)) {
    return null;
  }
  return Number.isSafeInteger(coins) && coins >= 1 ? coins : null;
}

export type StakeValidation =
  | { ok: true; coins: number }
  | { ok: false; error: "invalid" | "too_high" };

/** Create-lobby check: valid input, at most the host's own balance. */
export function validateStake(
  text: string,
  wdPerCoin: number | null,
  balance: number,
): StakeValidation {
  const coins = parseStakeInput(text, wdPerCoin);
  if (coins === null) return { ok: false, error: "invalid" };
  if (coins > balance) return { ok: false, error: "too_high" };
  return { ok: true, coins };
}

/** Host may set a stake: logged in, rules accepted, wallet up. */
export function canHostStake(s: StakeStatus | null): boolean {
  return (
    s !== null &&
    s.walletReady &&
    s.rulesAccepted === true &&
    s.balance !== null
  );
}

// ---- create game with stake ------------------------------------------------

export class StakeCreateError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/** POST /api/create_game with mineclashStakeCoins; throws StakeCreateError. */
export async function createStakeLobby(
  coins: number,
  token: string,
  base: string,
): Promise<{ gameID: string }> {
  const res = await fetch(`${base}/api/create_game`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ mineclashStakeCoins: coins }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new StakeCreateError(body.error ?? `http_${res.status}`);
  }
  return (await res.json()) as { gameID: string };
}
