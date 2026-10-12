// mineclash #19: "Player of the day" (most wins, most coins won).
// Data source does not exist yet (fetchPlayerOfTheDay returns null).
import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { translateText } from "../../Utils";
import {
  PlayerOfTheDay as Data,
  DayEntry,
  fetchPlayerOfTheDay,
} from "./MenuLogic";

@customElement("player-of-the-day")
export class PlayerOfTheDay extends LitElement {
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

  render() {
    return html`<div
      class="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-white/10 bg-surface px-4 py-2"
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
