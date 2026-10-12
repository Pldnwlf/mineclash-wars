// mineclash #19: main menu in the FrontWars layout (rebuilt in Lit/Tailwind):
// two rotation cards (stake / free), four tiles, tutorial + rules. Player of
// the day sits in the header on desktop (DesktopNavBar), here on mobile only.
// Rendered by <game-mode-selector>, which keeps the lobby feed and the gates;
// this element only shows and reports clicks.
import { GameMapType } from "@openfront/engine-api/game/GameTypes";
import { PublicGameInfo, PublicGames } from "@openfront/shared/WireSchemas";
import { html, LitElement, nothing, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { terrainMapFileLoader } from "../../TerrainMapFileLoader";
import {
  getGameModeLabel,
  getMapName,
  getModifierLabels,
  getSecondsUntilServerTimestamp,
  translateText,
} from "../../Utils";
import { fetchStakeStatus, StakeStatus } from "../StakeApi";
import {
  activeLobbyIDs,
  formatUsd,
  glowClass,
  joinedFromEvent,
  pickFreeLobby,
  pickStakeLobby,
  ringFraction,
  stakeEmptyKey,
  StakeInfo,
  stakeOf,
  syncJoined,
  toggleJoin,
} from "./MenuLogic";
import "./PlayerOfTheDay";

const RING_R = 40;
const RING_C = 2 * Math.PI * RING_R;
// Tiles: icon box above the label, glass or accent fill.
const TILE =
  "group relative flex w-full flex-col items-center justify-center gap-3 rounded-2xl px-3 py-5 text-[16px] font-bold leading-tight text-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";
const TILE_GLASS =
  "border border-white/10 bg-black/40 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:border-mc/60 hover:bg-black/50";
const TILE_ACCENT =
  "border border-white/15 bg-linear-to-b from-mc to-[color-mix(in_srgb,var(--color-mc)_82%,black)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] hover:brightness-110";
const WIDE =
  "flex min-h-[60px] w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-6 py-3.5 text-[20px] font-bold text-white backdrop-blur-md transition-colors hover:bg-white/10 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";
const CHIP =
  "rounded-lg border px-3 py-1.5 text-[13px] font-bold uppercase tracking-wider backdrop-blur-sm";

const ICONS = {
  play: svg`<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" fill="currentColor"/>`,
  plus: svg`<path d="M12 5v14M5 12h14"/>`,
  join: svg`<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>`,
  history: svg`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  cap: svg`<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>`,
  book: svg`<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>`,
  users: svg`<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>`,
};

function icon(name: keyof typeof ICONS, cls: string) {
  return html`<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="pointer-events-none shrink-0 ${cls}"
    aria-hidden="true"
  >
    ${ICONS[name]}
  </svg>`;
}

@customElement("mineclash-menu")
export class MineclashMenu extends LitElement {
  @property({ attribute: false }) lobbies: PublicGames | null = null;
  @property({ attribute: false }) serverTimeOffset = 0;
  @property({ attribute: false }) defaultLobbyTime = 30;
  /** Username invalid: everything dims. */
  @property({ type: Boolean }) disabled = false;
  /** Shown instead of a free lobby when the feed is down. */
  @property({ attribute: false }) feedMessage: unknown = nothing;
  @property({ attribute: false }) hostedCount = 0;
  @property({ attribute: false }) onJoin: (lobby: PublicGameInfo) => void =
    () => {};
  @property({ attribute: false }) onSolo: () => void = () => {};
  @property({ attribute: false }) onHost: () => void = () => {};
  @property({ attribute: false }) onJoinList: () => void = () => {};
  @property({ attribute: false }) onTutorial: () => void = () => {};

  @state() private joined: string | null = null;
  @state() private status: StakeStatus | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("join-lobby", this.onJoinEvent);
    document.addEventListener("leave-lobby", this.onLeaveEvent);
    fetchStakeStatus()
      .then((s) => (this.status = s))
      .catch(() => (this.status = null));
  }

  disconnectedCallback() {
    document.removeEventListener("join-lobby", this.onJoinEvent);
    document.removeEventListener("leave-lobby", this.onLeaveEvent);
    super.disconnectedCallback();
  }

  private onJoinEvent = (e: Event) => {
    const d = (e as CustomEvent).detail;
    this.joined = joinedFromEvent(d?.source, d?.gameID);
  };
  private onLeaveEvent = () => {
    this.joined = null;
  };

  willUpdate() {
    this.joined = syncJoined(this.joined, activeLobbyIDs(this.lobbies?.games));
  }

  private onCard(lobby: PublicGameInfo) {
    const r = toggleJoin(this.joined, lobby.gameID);
    if (r.action === "leave") {
      this.dispatchEvent(
        new CustomEvent("leave-lobby", {
          detail: { lobby: lobby.gameID },
          bubbles: true,
          composed: true,
        }),
      );
    } else {
      this.onJoin(lobby);
    }
  }

  private ring(lobby: PublicGameInfo) {
    const left = lobby.startsAt
      ? getSecondsUntilServerTimestamp(lobby.startsAt, this.serverTimeOffset)
      : this.defaultLobbyTime;
    const frac = ringFraction(left, Math.max(this.defaultLobbyTime, left));
    return html`<span
      class="relative flex size-24 shrink-0 items-center justify-center"
    >
      <svg class="absolute inset-0 -rotate-90" viewBox="0 0 96 96">
        <circle
          cx="48"
          cy="48"
          r=${RING_R}
          fill="rgba(0,0,0,.55)"
          stroke="rgba(255,255,255,.12)"
          stroke-width="6"
        />
        <circle
          cx="48"
          cy="48"
          r=${RING_R}
          fill="none"
          stroke="var(--color-mc)"
          stroke-width="6"
          stroke-linecap="round"
          stroke-dasharray=${RING_C}
          stroke-dashoffset=${RING_C * (1 - frac)}
        />
      </svg>
      <span class="relative flex flex-col items-center gap-0.5">
        <span
          class="text-[22px] font-extrabold leading-none tabular-nums text-white"
          >${left}s</span
        >
        <span
          class="text-[10px] font-bold uppercase tracking-wider text-white/55"
          >${translateText("mineclash.menu_starts_in")}</span
        >
      </span>
    </span>`;
  }

  private stakeChip(stake: StakeInfo) {
    const usd = formatUsd(stake.coins, this.status?.wdPerCoin ?? null);
    return html`<span
      class="${CHIP} border-amber-400/50 bg-amber-950/70 text-amber-200"
      >&#129689; ${stake.coins}${usd ? html` &asymp; ${usd}` : nothing}</span
    >`;
  }

  private card(
    titleKey: string,
    lobby: PublicGameInfo | null,
    stake: StakeInfo | null,
    empty: unknown,
  ) {
    const label = html`<span
      class="text-[13px] font-bold uppercase tracking-wider text-white/65 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]"
      >${translateText(titleKey)}</span
    >`;
    if (!lobby) {
      return html`<div
        class="flex h-72 min-w-0 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black/40 px-4 text-center text-sm font-medium text-white/60 backdrop-blur-md lg:h-80"
      >
        ${label}${empty}
      </div>`;
    }
    const map = lobby.gameConfig?.gameMap as GameMapType;
    const chips = getModifierLabels(
      lobby.gameConfig?.publicGameModifiers,
      lobby.gameConfig?.doomsdayClock?.speed,
    );
    const cap = lobby.gameConfig?.maxPlayers;
    const fill = cap ? Math.min(100, (lobby.numClients / cap) * 100) : 0;
    const isJoined = this.joined === lobby.gameID;
    return html`<button
      @click=${() => this.onCard(lobby)}
      ?disabled=${this.disabled}
      aria-pressed=${isJoined}
      class="group relative block h-72 w-full min-w-0 overflow-hidden rounded-2xl bg-[#10101b] text-left text-white transition-all active:scale-[0.99] lg:h-80 ${glowClass(
        isJoined,
      )} ${this.disabled ? "opacity-50 pointer-events-none" : ""}"
    >
      <div
        class="absolute inset-0 [filter:brightness(0.85)_saturate(0.9)_contrast(1.05)]"
      >
        <img
          src=${terrainMapFileLoader.getMapData(map).webpPath}
          alt=${getMapName(map) ?? ""}
          draggable="false"
          class="pointer-events-none absolute inset-0 size-full select-none object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div
          class="pointer-events-none absolute inset-0 bg-[rgb(70,132,180)] opacity-55 mix-blend-lighten"
        ></div>
        <div class="pointer-events-none absolute inset-0 bg-black/25"></div>
      </div>
      <div
        class="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.75)_0%,rgba(0,0,0,0.2)_45%,transparent_70%)]"
      ></div>
      <div class="relative flex h-full flex-col justify-between p-4">
        <div class="flex flex-wrap gap-1.5">
          ${chips.map(
            (c) =>
              html`<span
                class="${CHIP} border-cyan-400/50 bg-cyan-950/70 text-cyan-200"
                >${c}</span
              >`,
          )}
        </div>
        <div class="flex items-end justify-between gap-3">
          <div class="flex min-w-0 flex-1 flex-col gap-2">
            ${label}
            <span
              class="truncate text-3xl font-bold leading-tight text-white/95 [text-shadow:0_0_2px_rgba(0,0,0,0.8),0_1px_3px_rgba(0,0,0,0.6)]"
              >${getMapName(map)}</span
            >
            <div class="flex flex-wrap gap-1.5">
              <span class="${CHIP} border-sky-400/50 bg-sky-950/70 text-sky-200"
                >${lobby.gameConfig
                  ? getGameModeLabel(lobby.gameConfig)
                  : ""}</span
              >
              ${stake
                ? this.stakeChip(stake)
                : html`<span
                    class="${CHIP} border-white/25 bg-black/50 text-white/80"
                    >${translateText("mineclash.menu_free")}</span
                  >`}
            </div>
            <div
              class="flex items-center gap-2 text-[15px] font-bold text-white/85"
            >
              ${icon("users", "size-4")}<span class="tabular-nums"
                >${lobby.numClients}${cap !== undefined ? `/${cap}` : ""}</span
              >
            </div>
            <div
              class="h-2 overflow-hidden rounded-full border border-white/10 bg-black/45"
            >
              <div
                class="h-full rounded-full bg-mc shadow-[0_0_10px_var(--color-mc)] transition-[width] duration-500"
                style="width:${fill}%"
              ></div>
            </div>
          </div>
          ${this.ring(lobby)}
        </div>
      </div>
      ${isJoined
        ? html`<span
            class="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-mc/90 py-1 text-center text-sm font-bold uppercase tracking-widest text-gray-900"
          >
            ${translateText("mineclash.menu_joined")}
          </span>`
        : nothing}
    </button>`;
  }

  private tile(
    label: string,
    iconName: keyof typeof ICONS,
    accent: boolean,
    onClick: () => void,
    badge = 0,
  ) {
    return html`<button
      class="${TILE} ${accent ? TILE_ACCENT : TILE_GLASS}"
      ?disabled=${this.disabled}
      @click=${onClick}
    >
      <span
        class="flex size-[58px] items-center justify-center rounded-2xl ${accent
          ? "bg-white/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
          : "border border-mc/30 bg-mc/15 text-mc group-hover:bg-mc/25"}"
        >${icon(iconName, "size-[26px]")}</span
      >
      <span class="min-w-0 text-center">${label}</span>
      ${badge > 0
        ? html`<span
            class="absolute -right-2 -top-2 min-w-[28px] rounded-full bg-mc px-2 py-1 text-center text-[14px] font-bold leading-tight tabular-nums text-white shadow-lg ring-2 ring-black/30"
            >${badge}</span
          >`
        : nothing}
    </button>`;
  }

  render() {
    const games = this.lobbies?.games;
    // mineclash #23: wallet down => no stake card content, only the notice.
    const stakeLobby =
      this.status?.walletReady === false ? null : pickStakeLobby(games);
    const freeLobby = pickFreeLobby(games);
    return html`<div
      class="mx-auto flex w-full flex-col gap-4 px-4 pb-4 sm:px-0"
    >
      <player-of-the-day class="lg:hidden"></player-of-the-day>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        ${this.card(
          "mineclash.menu_next_stake",
          stakeLobby,
          stakeOf(stakeLobby),
          translateText(stakeEmptyKey(this.status?.walletReady)),
        )}
        ${this.card(
          "mineclash.menu_next_free",
          freeLobby,
          null,
          this.lobbies === null
            ? this.feedMessage === nothing
              ? html`<span
                  class="size-12 animate-spin rounded-full border-4 border-mc/30 border-t-mc"
                ></span>`
              : this.feedMessage
            : translateText("mineclash.menu_no_lobby"),
        )}
      </div>

      <div class="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        ${this.tile(translateText("main.solo"), "play", true, this.onSolo)}
        ${this.tile(translateText("main.create"), "plus", false, this.onHost)}
        ${this.tile(
          translateText("main.join"),
          "join",
          false,
          this.onJoinList,
          this.hostedCount,
        )}
        ${this.tile(
          translateText("mineclash.history_title"),
          "history",
          false,
          () => (location.hash = "#modal=history"),
        )}
      </div>

      <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <button
          class=${WIDE}
          ?disabled=${this.disabled}
          @click=${this.onTutorial}
        >
          ${icon("cap", "size-7 text-mc")}${translateText("main.tutorial")}
        </button>
        <a href="#modal=rules" class=${WIDE}
          >${icon("book", "size-7")}${translateText(
            "mineclash.menu_instructions",
          )}</a
        >
      </div>
    </div>`;
  }
}
