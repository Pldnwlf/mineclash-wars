// mineclash #21/#22: Konto oben rechts statt OpenFront-Kontomenü. Eingeloggt:
// MC-Name + verfügbare Coins (+ im Einsatz gehaltene, #54); Gast: Link zum
// Login auf mineclash.de. `compact` (mobil): ohne Name.
import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { getUserMe } from "../Api";
import { translateText } from "../Utils";
import { mineclashLoginOrigin } from "./Login";
import { fetchStakeStatus, StakeStatus } from "./StakeApi";

// The hold lands server-side shortly after these events.
const REFRESH_EVENTS = ["join-lobby", "leave-lobby"];
const REFRESH_DELAY_MS = 1500;

@customElement("mineclash-account-chip")
export class AccountChip extends LitElement {
  @property({ type: Boolean }) compact = false;
  @state() private name: string | null = null;
  @state() private status: StakeStatus | null = null;
  @state() private loaded = false;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    void this.load();
    for (const e of REFRESH_EVENTS) document.addEventListener(e, this.onEvent);
  }

  disconnectedCallback() {
    for (const e of REFRESH_EVENTS)
      document.removeEventListener(e, this.onEvent);
    super.disconnectedCallback();
  }

  private onEvent = () => {
    setTimeout(() => void this.load(), REFRESH_DELAY_MS);
  };

  private async load() {
    const [me, status] = await Promise.all([getUserMe(), fetchStakeStatus()]);
    this.name = me === false ? null : (me.player.username ?? null);
    this.status = status;
    this.loaded = true;
  }

  render() {
    if (!this.loaded) return null;
    const box = `flex h-10 items-center gap-2 whitespace-nowrap rounded-xl border border-white/15 bg-black/25 text-sm font-bold text-white ${this.compact ? "px-3" : "px-4"}`;
    if (this.name === null) {
      return html`<a
        class="${box} hover:border-white/30 hover:bg-black/40"
        href=${mineclashLoginOrigin()}
        target="_top"
        >${translateText(
          this.compact
            ? "mineclash.account_login_short"
            : "mineclash.account_login",
        )}</a
      >`;
    }
    const s = this.status;
    const available = s?.available ?? s?.balance ?? null;
    const held = (s?.balance ?? 0) - (s?.available ?? s?.balance ?? 0);
    return html`<div class=${box}>
      ${this.compact
        ? null
        : html`<span class="max-w-[160px] truncate">${this.name}</span>`}
      ${available === null
        ? null
        : html`<span class="text-mc">🪙 ${available.toLocaleString()}</span>`}
      ${held > 0
        ? html`<span class="text-xs font-semibold text-white/60"
            >${translateText("mineclash.account_held", {
              coins: held.toLocaleString(),
            })}</span
          >`
        : null}
    </div>`;
  }
}
