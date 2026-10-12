// mineclash #19: left icon rail on desktop (FrontWars layout). Buttons are
// plain .nav-menu-item[data-page] entries, so Navigation.ts opens the pages.
import { assetUrl } from "@openfront/shared/AssetUrls";
import { html, LitElement, nothing, svg, type SVGTemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import { NavNotificationsController } from "../../components/NavNotificationsController";
import { translateText } from "../../Utils";
import { buildCommit, sourceCodeUrl } from "../SourceLinks";

const ICONS: Record<string, SVGTemplateResult> = {
  news: svg`<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a3 3 0 0 1 0 6"/><path d="M18 6a7 7 0 0 1 0 12"/>`,
  history: svg`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  rules: svg`<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>`,
  help: svg`<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7"/><path d="M12 17h.01"/>`,
  settings: svg`<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>`,
  code: svg`<path d="m8 6-6 6 6 6"/><path d="m16 6 6 6-6 6"/>`,
};

const ITEM =
  "nav-menu-item relative flex w-[88px] shrink-0 flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-[12px] font-bold text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white [&.active]:bg-white/[0.08] [&.active]:text-white";

function icon(name: string) {
  return html`<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="pointer-events-none size-7 shrink-0"
    aria-hidden="true"
  >
    ${ICONS[name]}
  </svg>`;
}

@customElement("mineclash-side-nav")
export class SideNav extends LitElement {
  private notifications = new NavNotificationsController(this);

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    // Homepage backdrop (menu.css blurs and tints it).
    document.documentElement.style.setProperty(
      "--mc-bg-url",
      `url("${assetUrl("images/EuropeBackground.webp")}")`,
    );
  }

  private item(
    page: string,
    name: string,
    label: string,
    onClick?: () => void,
    dot = false,
  ) {
    return html`<button
      type="button"
      class="${ITEM} ${window.currentPageId === page ? "active" : ""}"
      data-page=${page}
      aria-label=${label}
      @click=${onClick}
    >
      ${icon(name)}<span class="pointer-events-none max-w-full truncate"
        >${label}</span
      >${dot
        ? html`<span
            class="absolute right-4 top-1.5 size-2 rounded-full bg-red-500"
          ></span>`
        : nothing}
    </button>`;
  }

  render() {
    return html`<aside
      class="fixed bottom-0 left-0 top-16 z-[55] hidden w-[104px] flex-col items-center gap-1.5 overflow-y-auto border-r border-white/10 bg-black/40 py-3.5 backdrop-blur-md lg:flex [.in-game_&]:hidden"
    >
      ${this.item(
        "page-news",
        "news",
        translateText("main.news"),
        this.notifications.onNewsClick,
        this.notifications.showNewsDot(),
      )}
      ${this.item(
        "page-history",
        "history",
        translateText("mineclash.history_title"),
      )}
      ${this.item(
        "page-rules",
        "rules",
        translateText("mineclash.menu_instructions"),
      )}
      ${this.item(
        "page-help",
        "help",
        translateText("main.help"),
        this.notifications.onHelpClick,
        this.notifications.showHelpDot(),
      )}
      <div class="my-1.5 h-px w-12 shrink-0 bg-white/10"></div>
      ${this.item("page-settings", "settings", translateText("main.settings"))}
      <div class="flex-1"></div>
      <a
        href=${sourceCodeUrl(buildCommit())}
        target="_blank"
        rel="noopener noreferrer"
        class=${ITEM.replace("nav-menu-item ", "")}
      >
        ${icon("code")}<span class="max-w-full truncate"
          >${translateText("mineclash.link_source")}</span
        >
      </a>
    </aside>`;
  }
}
