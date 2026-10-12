// mineclash #39: Einsatz-Ergebnis im Endscreen (WinModal haengt nur das
// Element ein). Pollt GET /api/mineclash/result/:gameId bis paid/refunded.
import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { getPersistentID } from "../Auth";
import { ClientEnv } from "../ClientEnv";
import { translateText } from "../Utils";
import { formatUsd } from "./menu/MenuLogic";

export type ResultBody = {
  status: "pending" | "paid" | "refunded" | "none";
  reason?: string;
  stakeCoins?: number;
  potCoins?: number;
  rakeCoins?: number;
  payouts?: { uuid: string; coins: number }[];
};

export const POLL_MS = 3000;

// Server-Gruende (MineclashVerify + Wallet) -> ein Textschluessel.
const REASON_KEY: Record<string, string> = {
  no_human_winner: "nations_won",
  nations_won: "nations_won",
  too_few_humans: "too_few_humans",
  mismatch: "recount_mismatch",
  error: "recount_mismatch",
  recount_mismatch: "recount_mismatch",
  aborted: "aborted",
};

export function reasonKey(reason: string | undefined): string {
  return `mineclash.result_reason_${REASON_KEY[reason ?? ""] ?? "aborted"}`;
}

export interface ResultView {
  final: boolean;
  statusKey: string;
  reasonKey?: string;
  stake: number;
  pot: number;
  rake: number;
  /** Gewinn (+) / Verlust (-) in Coins; null solange offen. */
  net: number | null;
  /** Anteil je Gewinner, nur bei mehreren Gewinnern. */
  share: number | null;
}

export function describeResult(
  body: ResultBody | null,
  myUuid: string,
  stakeCoins: number,
): ResultView {
  const stake = body?.stakeCoins ?? stakeCoins;
  const base = { stake, pot: body?.potCoins ?? 0, rake: body?.rakeCoins ?? 0 };
  if (body?.status === "refunded") {
    return {
      ...base,
      final: true,
      statusKey: "mineclash.result_refunded",
      reasonKey: reasonKey(body.reason),
      net: 0,
      share: null,
    };
  }
  if (body?.status === "paid") {
    const payouts = body.payouts ?? [];
    const mine = payouts.find((p) => p.uuid === myUuid)?.coins ?? 0;
    return {
      ...base,
      final: true,
      statusKey: "mineclash.result_paid",
      net: mine - stake,
      share: payouts.length > 1 ? (payouts[0]?.coins ?? null) : null,
    };
  }
  return {
    ...base,
    final: false,
    statusKey: "mineclash.result_pending",
    net: null,
    share: null,
  };
}

const base = (gameID: string) =>
  `${ClientEnv.gameHttpBase(gameID)}/${ClientEnv.gameWorkerPath(gameID)}/api/mineclash`;

export async function fetchResult(gameID: string): Promise<ResultBody | null> {
  try {
    const res = await fetch(`${base(gameID)}/result/${gameID}`);
    return res.ok ? ((await res.json()) as ResultBody) : null;
  } catch {
    return null;
  }
}

async function fetchRate(gameID: string): Promise<number | null> {
  try {
    const res = await fetch(`${base(gameID)}/status`);
    if (!res.ok) return null;
    const v = ((await res.json()) as { wdPerCoin?: number | null }).wdPerCoin;
    return typeof v === "number" ? v : null;
  } catch {
    return null;
  }
}

@customElement("mineclash-result")
export class MineclashResult extends LitElement {
  @property() gameID = "";
  @property({ type: Number }) stakeCoins = 0;
  // Ersetzbar fuer Tests.
  fetcher: (gameID: string) => Promise<ResultBody | null> = fetchResult;
  myUuid = "";

  @state() private body: ResultBody | null = null;
  @state() private rate: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.stopped = false;
    if (this.myUuid === "") {
      try {
        this.myUuid = getPersistentID();
      } catch {
        // kein Login: Gewinn bleibt unbekannt
      }
    }
    void fetchRate(this.gameID).then((r) => (this.rate = r));
    void this.poll();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  async poll(): Promise<void> {
    this.body = (await this.fetcher(this.gameID)) ?? this.body;
    if (this.stopped) return;
    const s = this.body?.status;
    if (s === "paid" || s === "refunded") return;
    this.timer = setTimeout(() => void this.poll(), POLL_MS);
  }

  render() {
    if (!this.gameID || this.stakeCoins <= 0) return nothing;
    const v = describeResult(this.body, this.myUuid, this.stakeCoins);
    const coins = (n: number) =>
      `${n.toLocaleString()} Coins` +
      (this.rate !== null ? ` (≈${formatUsd(Math.abs(n), this.rate)})` : "");
    const row = (label: string, value: string, cls = "text-white") =>
      html`<div class="flex justify-between gap-4">
        <span class="text-white/60">${label}</span
        ><span class="font-bold ${cls}">${value}</span>
      </div>`;
    return html`<div
      data-test-mineclash-result
      class="mb-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm"
    >
      <div class="text-xs font-bold text-amber-400 uppercase tracking-widest">
        ${translateText("mineclash.result_title")}
      </div>
      <div data-test-status class="my-1 font-bold text-white">
        ${translateText(v.statusKey)}
      </div>
      ${v.reasonKey
        ? html`<div data-test-reason class="mb-1 text-white/80">
            ${translateText(v.reasonKey)}
          </div>`
        : nothing}
      ${row(translateText("mineclash.result_stake"), coins(v.stake))}
      ${v.pot > 0
        ? row(translateText("mineclash.result_pot"), coins(v.pot))
        : nothing}
      ${v.final && v.rake > 0
        ? row(translateText("mineclash.result_rake"), coins(v.rake))
        : nothing}
      ${v.share !== null
        ? row(translateText("mineclash.result_share"), coins(v.share))
        : nothing}
      ${v.net !== null
        ? row(
            translateText(
              v.net > 0
                ? "mineclash.result_net_win"
                : v.net < 0
                  ? "mineclash.result_net_loss"
                  : "mineclash.result_net_even",
            ),
            (v.net > 0 ? "+" : "") + coins(v.net),
            v.net > 0
              ? "text-green-400"
              : v.net < 0
                ? "text-red-400"
                : "text-white",
          )
        : nothing}
      <div class="mt-1 text-xs text-white/50">
        ${translateText("mineclash.result_history_hint")}
      </div>
    </div>`;
  }
}
