// mineclash #19: "Player of the day" (most wins, most coins won).
// Data source does not exist yet (fetchPlayerOfTheDay returns null).
import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { translateText } from "../../Utils";
import {
  PlayerOfTheDay as Data,
  DayEntry,
  fetchPlayerOfTheDay,
} from "./MenuLogic";

@customElement("player-of-the-day")
export class PlayerOfTheDay extends LitElement {
  /** Header variant (FrontWars): crown, label, top winner, wins today. */
  @property({ type: Boolean }) compact = false;
  @state() private data: Data | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    fetchPlayerOfTheDay()
      .then((d) => (this.data = d))
      .catch(() => (this.data = null));
  }

  private entry(labelKey: string, e: DayEntry | null | undefined) {
    return html`<div class="flex items-baseline gap-2 min-w-0">
      <span class="text-xs uppercase tracking-wider text-white/60"
        >${translateText(labelKey)}</span
      >
      <span class="truncate text-sm font-bold text-cyber-yellow">
        ${e
          ? html`${e.name} <span class="text-white/70">(${e.value})</span>`
          : translateText("mineclash.potd_empty")}
      </span>
    </div>`;
  }

  private renderCompact() {
    const e = this.data?.mostWins;
    return html`<div class="flex h-12 items-center gap-4 rounded-xl px-3.5">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="size-6 shrink-0 text-mc drop-shadow-[0_0_6px_var(--color-mc)]"
        aria-hidden="true"
      >
        <path d="M2 18h20M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5z" />
      </svg>
      <span
        class="whitespace-nowrap text-[12px] font-bold uppercase tracking-[0.14em] text-white/40"
        >${translateText("mineclash.potd_title")}</span
      >
      <span class="h-6 w-px shrink-0 bg-white/10"></span>
      <span class="max-w-[260px] truncate text-[20px] font-bold text-white"
        >${e ? e.name : translateText("mineclash.potd_empty")}</span
      >
      ${e
        ? html`<span class="h-6 w-px shrink-0 bg-white/10"></span
            ><span class="flex shrink-0 items-center gap-2"
              ><span
                class="text-[24px] font-extrabold leading-none tabular-nums text-mc"
                >${e.value}</span
              ><span class="whitespace-nowrap text-[13px] text-white/40"
                >${translateText("mineclash.potd_wins_today")}</span
              ></span
            >`
        : null}
    </div>`;
  }

  render() {
    if (this.compact) return this.renderCompact();
    return html`<div
      class="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-2 backdrop-blur-md"
    >
      <span
        class="text-sm font-bold uppercase tracking-widest text-frame-orange"
        >${translateText("mineclash.potd_title")}</span
      >
      ${this.entry("mineclash.potd_wins", this.data?.mostWins)}
      ${this.entry("mineclash.potd_coins", this.data?.mostCoinsWon)}
    </div>`;
  }
}
