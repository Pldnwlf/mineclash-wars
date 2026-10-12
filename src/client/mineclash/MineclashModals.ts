// mineclash #31: credits page, stake rules page and the "Accept" popup.
import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import credits from "../../../CREDITS.md?raw";
import { BaseModal } from "../components/BaseModal";
import { modalHeader } from "../components/ui/ModalHeader";
import { renderMarkdown } from "../Markdown";
import { translateText } from "../Utils";
import "./HistoryList";
import { renderLegalLinks, renderRules } from "./RulesContent";

const PROSE =
  "px-6 py-3 max-w-3xl [&_a]:text-blue-400 [&_a:hover]:text-blue-300 " +
  "[&_h1]:hidden [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-blue-200 " +
  "[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-blue-100 " +
  "[&_p]:text-gray-300 [&_p]:mb-3 [&_p]:text-sm [&_strong]:text-white";

@customElement("credits-modal")
export class CreditsModal extends BaseModal {
  protected routerName = "credits";

  protected renderHeaderSlot() {
    return modalHeader({
      title: translateText("mineclash.credits_title"),
      onBack: () => this.close(),
      ariaLabel: translateText("common.back"),
    });
  }

  protected renderBody() {
    return html`<div class="overflow-y-auto ${PROSE}">
      ${renderMarkdown(credits)}
    </div>`;
  }
}

@customElement("rules-modal")
export class RulesModal extends BaseModal {
  protected routerName = "rules";

  protected renderHeaderSlot() {
    return modalHeader({
      title: translateText("mineclash.rules_title"),
      onBack: () => this.close(),
      ariaLabel: translateText("common.back"),
    });
  }

  protected renderBody() {
    return html`<div class="overflow-y-auto ${PROSE}">
      ${renderRules()}
      <div class="mt-6">${renderLegalLinks()}</div>
    </div>`;
  }
}

// mineclash #40: Match-Historie
@customElement("history-modal")
export class HistoryModal extends BaseModal {
  protected routerName = "history";

  protected renderHeaderSlot() {
    return modalHeader({
      title: translateText("mineclash.history_title"),
      onBack: () => this.close(),
      ariaLabel: translateText("common.back"),
    });
  }

  protected renderBody() {
    return html`<div class="overflow-y-auto">
      <history-list></history-list>
    </div>`;
  }
}

/**
 * Popup shown before the first stake match join: rules + big "Accept" button.
 * Interface only: the caller shows it (`show()`) and passes `onAccept`.
 * Storing the acceptance per UUID server-side and gating the stake join on it
 * comes with #21/#23 (login + stake lobbies); nothing is persisted here.
 */
@customElement("rules-popup")
export class RulesPopup extends LitElement {
  @property({ attribute: false }) onAccept: () => void = () => {};
  @state() private visible = false;

  createRenderRoot() {
    return this;
  }

  show() {
    this.visible = true;
  }

  hide() {
    this.visible = false;
  }

  render() {
    if (!this.visible) return html``;
    return html`<div
      class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4"
    >
      <div
        class="flex max-h-full w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-zinc-900"
      >
        <h2 class="p-5 text-xl font-bold uppercase tracking-widest text-white">
          ${translateText("mineclash.rules_title")}
        </h2>
        <div class="flex-1 overflow-y-auto px-5 pb-3 text-sm">
          ${renderRules()}
          <div class="mt-5">${renderLegalLinks()}</div>
        </div>
        <div class="border-t border-white/10 p-5">
          <p class="mb-3 text-xs text-gray-400">
            ${translateText("mineclash.accept_hint")}
          </p>
          <button
            class="w-full rounded-lg bg-emerald-600 py-4 text-xl font-bold uppercase tracking-wider text-white hover:bg-emerald-500"
            @click=${() => {
              this.hide();
              this.onAccept();
            }}
          >
            ${translateText("mineclash.accept")}
          </button>
        </div>
      </div>
    </div>`;
  }
}
