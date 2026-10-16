// mineclash #40: Liste der eigenen Matches mit Replay und Nach-Match-Report.
import {
  ReportReasonSchema,
  type ReportReason,
} from "@openfront/shared/WireSchemas";
import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { ClientEnv } from "../ClientEnv";
import { currentPagePath, getMapName, translateText } from "../Utils";
import { fetchHistory, type HistoryEntry } from "./HistoryApi";
import { reportAfterMatch, type PostMatchReportResult } from "./ReportApi";

const REASONS = ReportReasonSchema.options;
const BTN =
  "rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/85 hover:border-mc/60 hover:text-white";

@customElement("history-list")
export class HistoryList extends LitElement {
  @property({ attribute: false }) loader: typeof fetchHistory = fetchHistory;
  @property({ attribute: false }) reporter: typeof reportAfterMatch =
    reportAfterMatch;

  @state() private items: HistoryEntry[] | null | undefined = undefined;
  @state() private open: string | null = null; // Match mit offenem Formular
  @state() private picked = new Set<string>();
  @state() private reason: ReportReason = REASONS[0];
  @state() private status: PostMatchReportResult | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    void this.loader().then((m) => (this.items = m));
  }

  private async submit(m: HistoryEntry) {
    this.status = await this.reporter(m.id, [...this.picked], this.reason);
    if (this.status === "ok") this.open = null;
  }

  private toggleReport(m: HistoryEntry) {
    this.open = this.open === m.id ? null : m.id;
    this.picked = new Set();
    this.status = null;
  }

  private form(m: HistoryEntry) {
    return html`<div class="mt-3 space-y-2 rounded-lg bg-black/30 p-3">
      <div class="flex flex-wrap gap-3">
        ${m.players.map(
          (p) =>
            html`<label class="flex items-center gap-1 text-gray-200">
              <input
                type="checkbox"
                class="report-target"
                .checked=${this.picked.has(p.uuid)}
                @change=${(e: Event) => {
                  const next = new Set(this.picked);
                  if ((e.target as HTMLInputElement).checked) next.add(p.uuid);
                  else next.delete(p.uuid);
                  this.picked = next;
                }}
              />${p.name}
            </label>`,
        )}
      </div>
      <select
        class="report-reason rounded bg-zinc-800 p-2 text-white"
        @change=${(e: Event) =>
          (this.reason = (e.target as HTMLSelectElement).value as ReportReason)}
      >
        ${REASONS.map(
          (r) =>
            html`<option value=${r} ?selected=${r === this.reason}>
              ${translateText(`player_panel.report_reason_${r}`)}
            </option>`,
        )}
      </select>
      <button
        class="report-submit ml-2 rounded bg-red-600 px-3 py-2 font-bold text-white disabled:opacity-50"
        ?disabled=${this.picked.size === 0}
        @click=${() => this.submit(m)}
      >
        ${translateText("player_panel.report_submit")}
      </button>
      ${this.status && this.status !== "ok"
        ? html`<p class="report-error text-red-400">
            ${translateText(`mineclash.history_report_${this.status}`)}
          </p>`
        : ""}
    </div>`;
  }

  render() {
    if (this.items === undefined)
      return html`<p class="p-6 text-gray-400">
        ${translateText("mineclash.history_loading")}
      </p>`;
    if (this.items === null)
      return html`<p class="p-6 text-gray-300">
        ${translateText("mineclash.history_login")}
      </p>`;
    if (this.items.length === 0)
      return html`<p class="p-6 text-gray-300">
        ${translateText("mineclash.history_empty")}
      </p>`;
    return html`<ul class="space-y-3 p-4 text-sm">
      ${this.items.map(
        (m) =>
          html`<li class="match rounded-xl border border-white/10 p-4">
            <div
              class="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-200"
            >
              <span>${new Date(m.end).toLocaleString()}</span>
              <span>${getMapName(m.map) ?? m.map}</span>
              <span>${m.mode}</span>
              <strong class="result text-white"
                >${translateText(
                  `mineclash.history_result_${m.result}`,
                )}</strong
              >
              ${m.stakeCoins !== undefined
                ? html`<span
                    class="stake rounded-full border border-amber-400/50 bg-amber-950/70 px-2 py-0.5 text-xs font-bold text-amber-200"
                    >🪙 ${m.stakeCoins}</span
                  >`
                : ""}
              ${m.netCoins !== undefined
                ? html`<span
                    class="net font-bold ${m.netCoins > 0
                      ? "text-green-400"
                      : m.netCoins < 0
                        ? "text-red-400"
                        : "text-white/70"}"
                    >${m.netCoins > 0 ? "+" : ""}${m.netCoins} Coins</span
                  >`
                : ""}
              ${m.payoutStatus
                ? html`<span class="payout text-white/60"
                    >${translateText(
                      `mineclash.result_${m.payoutStatus}`,
                    )}</span
                  >`
                : ""}
            </div>
            <div class="mt-2 flex gap-4">
              <a
                class="replay ${BTN}"
                href=${currentPagePath(ClientEnv.gamePath(m.id))}
                >${translateText("mineclash.history_replay")}</a
              >
              ${m.players.length > 0
                ? html`<button
                    class="report-toggle ${BTN}"
                    @click=${() => this.toggleReport(m)}
                  >
                    ${translateText("mineclash.history_report")}
                  </button>`
                : ""}
            </div>
            ${this.open === m.id ? this.form(m) : ""}
          </li>`,
      )}
    </ul>`;
  }
}
