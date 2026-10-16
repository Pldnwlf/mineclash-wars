import { assetUrl } from "@openfront/shared/AssetUrls";
import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import "../mineclash/AccountChip";
import { Features } from "../mineclash/Features";
import "./CosmeticBackground";
import "./NavAccountMenu";
import "./NavUtilityIcons";
import "./NewsBox";

@customElement("play-page")
export class PlayPage extends LitElement {
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <div
        id="page-play"
        class="flex flex-col gap-2 w-full px-0 lg:px-4 min-h-0"
      >
        <token-login class="absolute"></token-login>

        <!-- Mobile: Fixed top bar -->
        <div
          class="lg:hidden fixed left-0 right-0 top-[var(--top-ad-height,0px)] z-40 pt-[env(safe-area-inset-top)] bg-surface border-b border-white/10"
        >
          <div
            class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center h-14 px-2 gap-2"
          >
            <button
              id="hamburger-btn"
              class="col-start-1 justify-self-start h-10 shrink-0 aspect-[4/3] flex text-white/90 rounded-md items-center justify-center transition-colors"
              data-i18n-aria-label="main.menu"
              aria-expanded="false"
              aria-controls="sidebar-menu"
              aria-haspopup="dialog"
              data-i18n-title="main.menu"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="size-8"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            </button>

            <div
              class="col-start-2 flex items-center justify-center text-malibu-blue min-w-0"
            >
              <img
                src=${assetUrl("images/mineclash/Favicon.png")}
                alt="MineClash"
                class="h-9 w-auto object-contain"
              />
            </div>

            <!-- Right slot: bell, help, settings and the profile control. The menu is
                 the account affordance on every platform now — on CrazyGames
                 its "Sign in" item hands off to their SDK prompt. -->
            <div
              class="col-start-3 justify-self-end shrink-0 flex items-center gap-0.5"
            >
              <nav-utility-icons size="mobile"></nav-utility-icons>
              ${Features.openfrontAuth
                ? html`<nav-account-menu variant="mobile"></nav-account-menu>`
                : html`<mineclash-account-chip
                    compact
                  ></mineclash-account-chip>`}
            </div>
          </div>
        </div>

        <!-- Top strip: news + identity on the left, Streaming Now on the right. The 2fr/1fr
             split only exists while the panel is live (.streaming-live via has-[]) —
             otherwise the left column takes the full row. -->
        <div
          class="w-full pb-4 lg:pb-0 flex flex-col gap-4 sm:-mx-4 sm:w-[calc(100%+2rem)] lg:mx-0 lg:w-full lg:grid lg:grid-cols-1 lg:has-[.streaming-live]:grid-cols-[2fr_1fr] lg:gap-4 lg:items-stretch"
        >
          <!-- Mobile: spacer for fixed top bar -->
          <div
            class="lg:hidden h-[calc(env(safe-area-inset-top)+56px)] -mb-4"
          ></div>

          <!-- Left column: news banner + identity row, stacked tight. -->
          <!-- mineclash #19: FrontWars glass name bar; news lives in the icon
               rail on desktop, so the banner shows on mobile only. -->
          <div class="flex flex-col gap-2 min-w-0">
            <news-box class="lg:hidden"></news-box>

            <div
              class="relative z-20 flex items-center overflow-visible rounded-2xl border border-white/10 bg-black/40 p-[9px] backdrop-blur-md"
            >
              <div
                class="flex h-12 w-full min-w-0 items-center rounded-xl border border-white/10 bg-black/30 px-3 sm:h-16 sm:px-5"
              >
                <username-input
                  class="flex-1 min-w-0 h-10 sm:h-[50px] [&_input]:text-2xl [&_input]:font-bold"
                ></username-input>
              </div>
            </div>
          </div>
        </div>

        <game-mode-selector></game-mode-selector>
      </div>
    `;
  }
}
