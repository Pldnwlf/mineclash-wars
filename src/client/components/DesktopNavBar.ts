import { assetUrl } from "@openfront/shared/AssetUrls";
import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { Features } from "../mineclash/Features";
import "../mineclash/menu/PlayerOfTheDay";
import "../mineclash/menu/SideNav";
import "./NavAccountMenu";
import "./NavUtilityIcons";

@customElement("desktop-nav-bar")
export class DesktopNavBar extends LitElement {
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("showPage", this._onShowPage);

    const current = window.currentPageId;
    if (current) {
      // Wait for render
      this.updateComplete.then(() => {
        this._updateActiveState(current);
      });
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("showPage", this._onShowPage);
  }

  private _onShowPage = (e: Event) => {
    const pageId = (e as CustomEvent).detail;
    this._updateActiveState(pageId);
  };

  private _updateActiveState(pageId: string) {
    this.querySelectorAll(".nav-menu-item").forEach((el) => {
      if ((el as HTMLElement).dataset.page === pageId) {
        el.classList.add("active");
      } else {
        el.classList.remove("active");
      }
    });
  }

  render() {
    window.currentPageId ??= "page-play";

    // mineclash #19: FrontWars layout: header with logo, player of the day and
    // account; pages (news, history, rules, help, settings) in the icon rail.
    // mineclash #5: Store/Inventar/Rangliste/Clans nicht gerendert (mineclash/Features.ts).
    return html`
      <nav
        class="relative z-50 hidden h-16 w-full shrink-0 items-center border-b border-white/10 bg-black/40 backdrop-blur-md lg:flex"
      >
        <a
          href="/"
          class="flex h-full shrink-0 items-center pl-8"
          aria-label="MineClash"
        >
          <img
            class="block h-8 aspect-[1328/249]"
            src=${assetUrl("images/mineclash/Logo.png")}
            alt="MineClash"
          />
          <span id="game-version" class="hidden"></span>
        </a>
        <div class="flex min-w-0 flex-1 items-center justify-center px-4">
          <player-of-the-day
            compact
            class="min-w-0 max-[1100px]:hidden"
          ></player-of-the-day>
        </div>
        <div class="flex shrink-0 items-center gap-1 pr-5">
          ${Features.upstreamMenu
            ? html`<nav-utility-icons size="desktop"></nav-utility-icons>`
            : null}
          <nav-account-menu variant="desktop"></nav-account-menu>
        </div>
      </nav>
      <mineclash-side-nav></mineclash-side-nav>
    `;
  }
}
