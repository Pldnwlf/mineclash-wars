// mineclash #23: stake field of "Create lobby". Only for logged-in hosts with
// accepted rules and a working wallet. Fires `stake-apply` ({ coins | null });
// HostLobbyModal then re-creates the lobby (a stake lobby is created public).
import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { translateText } from "../Utils";
import { formatUsd } from "./menu/MenuLogic";
import {
  canHostStake,
  fetchStakeStatus,
  StakeStatus,
  validateStake,
} from "./StakeApi";

@customElement("host-stake-field")
export class HostStakeField extends LitElement {
  /** Stake of the current lobby (null = free). */
  @property({ attribute: false }) applied: number | null = null;
  /** Server error code of the last apply, shown under the field. */
  @property({ attribute: false }) serverError: string | null = null;
  @property({ type: Boolean }) busy = false;

  @state() private status: StakeStatus | null = null;
  @state() private text = "";
  @state() private error: "invalid" | "too_high" | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    void fetchStakeStatus().then((s) => (this.status = s));
  }

  private apply() {
    if (this.text.trim() === "") {
      this.error = null;
      if (this.applied !== null) this.emit(null);
      return;
    }
    const v = validateStake(
      this.text,
      this.status?.wdPerCoin ?? null,
      this.status?.balance ?? 0,
    );
    this.error = v.ok ? null : v.error;
    if (v.ok) this.emit(v.coins);
  }

  private emit(coins: number | null) {
    this.dispatchEvent(
      new CustomEvent("stake-apply", {
        detail: { coins },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    if (!canHostStake(this.status)) return nothing;
    const s = this.status!;
    const msg =
      this.error !== null
        ? translateText(`mineclash.stake_${this.error}`)
        : this.serverError;
    return html`<div
      data-test-host-stake
      class="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"
    >
      <label
        class="mb-2 block text-xs font-bold uppercase tracking-widest text-amber-400"
        >${translateText("mineclash.stake_field")}</label
      >
      <div class="flex gap-2">
        <input
          class="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-white"
          .value=${this.text}
          placeholder=${this.applied !== null
            ? `${this.applied} (${formatUsd(this.applied, s.wdPerCoin)})`
            : "0"}
          @input=${(e: Event) =>
            (this.text = (e.target as HTMLInputElement).value)}
          @keydown=${(e: KeyboardEvent) => e.key === "Enter" && this.apply()}
        />
        <button
          class="rounded-lg bg-amber-500 px-4 py-2 font-bold text-black disabled:opacity-50"
          ?disabled=${this.busy}
          @click=${() => this.apply()}
        >
          ${translateText("mineclash.stake_apply")}
        </button>
      </div>
      <div class="mt-2 text-xs text-white/60">
        &#129689; ${s.balance} &middot;
        ${translateText("mineclash.stake_hint_locked")}
      </div>
      ${msg
        ? html`<div class="mt-2 text-sm text-red-400">${msg}</div>`
        : nothing}
    </div>`;
  }
}
