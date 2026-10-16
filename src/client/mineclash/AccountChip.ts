// mineclash #21/#22: Konto oben rechts statt OpenFront-Kontomenü. Eingeloggt:
// MC-Name + Coin-Guthaben; Gast: Link zum Login auf mineclash.de.
import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getUserMe } from "../Api";
import { translateText } from "../Utils";
import { mineclashLoginOrigin } from "./Login";
import { fetchStakeStatus } from "./StakeApi";

@customElement("mineclash-account-chip")
export class AccountChip extends LitElement {
  @state() private name: string | null = null;
  @state() private balance: number | null = null;
  @state() private loaded = false;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    void this.load();
  }

  private async load() {
    const [me, status] = await Promise.all([getUserMe(), fetchStakeStatus()]);
    this.name = me === false ? null : (me.player.username ?? null);
    this.balance = status?.balance ?? null;
    this.loaded = true;
  }

  render() {
    if (!this.loaded) return null;
    const box =
      "flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-black/25 px-4 text-sm font-bold text-white";
    if (this.name === null) {
      return html`<a
        class="${box} hover:border-white/30 hover:bg-black/40"
        href=${mineclashLoginOrigin()}
        target="_top"
        >${translateText("mineclash.account_login")}</a
      >`;
    }
    return html`<div class=${box}>
      <span class="max-w-[160px] truncate">${this.name}</span>
      ${this.balance === null
        ? null
        : html`<span class="text-[var(--color-mc,#f29520)]"
            >🪙 ${this.balance.toLocaleString()}</span
          >`}
    </div>`;
  }
}
