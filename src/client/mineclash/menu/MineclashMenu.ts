// mineclash #19: main menu in the FrontWars layout (rebuilt in Lit/Tailwind):
// player of the day, two rotation cards (stake / free), tiles, tutorial+rules.
// Rendered by <game-mode-selector>, which keeps the lobby feed and the gates;
// this element only shows and reports clicks.
import { GameMapType } from "@openfront/engine-api/game/GameTypes";
import { PublicGameInfo, PublicGames } from "@openfront/shared/WireSchemas";
import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { terrainMapFileLoader } from "../../TerrainMapFileLoader";
import {
  getGameModeLabel,
  getMapName,
  getModifierLabels,
  getSecondsUntilServerTimestamp,
  translateText,
} from "../../Utils";
import {
  activeLobbyIDs,
  fetchCoinRateUsd,
  formatUsd,
  glowClass,
  joinedFromEvent,
  pickFreeLobby,
  pickStakeLobby,
  ringFraction,
  StakeInfo,
  syncJoined,
  toggleJoin,
} from "./MenuLogic";
import "./PlayerOfTheDay";

const RING_R = 18;
const RING_C = 2 * Math.PI * RING_R;
const TILE =
  "relative flex h-16 w-full items-center justify-center rounded-xl text-base font-bold uppercase tracking-wider text-white transition-all hover:brightness-110 active:brightness-95 disabled:opacity-50 disabled:pointer-events-none";

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
  @state() private rate: number | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("join-lobby", this.onJoinEvent);
    document.addEventListener("leave-lobby", this.onLeaveEvent);
    fetchCoinRateUsd()
      .then((r) => (this.rate = r))
      .catch(() => (this.rate = null));
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
    return html`<span class="relative flex size-12 items-center justify-center">
      <svg class="absolute inset-0 -rotate-90" viewBox="0 0 44 44">
        <circle
          cx="22"
          cy="22"
          r=${RING_R}
          fill="rgba(0,0,0,.6)"
          stroke="rgba(255,255,255,.2)"
          stroke-width="4"
        />
        <circle
          cx="22"
          cy="22"
          r=${RING_R}
          fill="none"
          stroke="var(--color-frame-orange)"
          stroke-width="4"
          stroke-linecap="round"
          stroke-dasharray=${RING_C}
          stroke-dashoffset=${RING_C * (1 - frac)}
        />
      </svg>
      <span class="relative text-xs font-bold tabular-nums text-white"
        >${left}</span
      >
    </span>`;
  }

  private stakeRow(stake: StakeInfo) {
    const usd = formatUsd(stake.coins, this.rate);
    return html`<span class="font-bold text-cyber-yellow"
      >&#129689;
      ${stake.coins}${usd
        ? html` <span class="text-white/70">&asymp; ${usd}</span>`
        : nothing}</span
    >`;
  }

  private card(
    titleKey: string,
    lobby: PublicGameInfo | null,
    stake: StakeInfo | null,
    empty: unknown,
  ) {
    const heading = html`<h2
      class="mb-2 text-sm font-bold uppercase tracking-widest text-white/70"
    >
      ${translateText(titleKey)}
    </h2>`;
    if (!lobby) {
      return html`<div class="min-w-0">
        ${heading}
        <div
          class="flex h-48 items-center justify-center rounded-2xl border border-dashed border-white/20 bg-surface/60 px-4 text-center text-sm font-medium text-white/60 sm:h-56"
        >
          ${empty}
        </div>
      </div>`;
    }
    const map = lobby.gameConfig?.gameMap as GameMapType;
    const chips = getModifierLabels(
      lobby.gameConfig?.publicGameModifiers,
      lobby.gameConfig?.doomsdayClock?.speed,
    );
    const cap = lobby.gameConfig?.maxPlayers;
    const isJoined = this.joined === lobby.gameID;
    return html`<div class="min-w-0">
      ${heading}
      <button
        @click=${() => this.onCard(lobby)}
        ?disabled=${this.disabled}
        aria-pressed=${isJoined}
        class="relative block h-48 w-full overflow-hidden rounded-2xl bg-surface text-left uppercase text-white transition-shadow duration-200 sm:h-56 ${glowClass(
          isJoined,
        )} ${this.disabled ? "opacity-50 pointer-events-none" : ""}"
      >
        <img
          src=${terrainMapFileLoader.getMapData(map).webpPath}
          alt=${getMapName(map) ?? ""}
          draggable="false"
          class="pointer-events-none absolute inset-0 size-full select-none object-cover"
        />
        <div
          class="absolute inset-x-2 top-2 flex items-start justify-between gap-2"
        >
          <div class="flex min-w-0 flex-wrap gap-1">
            ${chips.map(
              (c) =>
                html`<span
                  class="rounded bg-malibu-blue px-2 py-1 text-xs font-bold tracking-widest"
                  >${c}</span
                >`,
            )}
          </div>
          ${this.ring(lobby)}
        </div>
        <div
          class="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-black/70 px-3 py-2"
        >
          <div class="min-w-0">
            <p class="truncate text-base font-bold tracking-wider">
              ${getMapName(map)}
            </p>
            <p class="truncate text-xs tracking-wider text-white/70">
              ${lobby.gameConfig ? getGameModeLabel(lobby.gameConfig) : ""}
            </p>
          </div>
          <div class="flex shrink-0 flex-col items-end text-sm">
            <span class="font-bold tabular-nums">
              ${lobby.numClients}${cap !== undefined ? `/${cap}` : ""} &#128100;
            </span>
            ${stake
              ? this.stakeRow(stake)
              : html`<span class="text-xs text-white/70"
                  >${translateText("mineclash.menu_free")}</span
                >`}
          </div>
        </div>
        ${isJoined
          ? html`<span
              class="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-cyber-yellow/90 py-1 text-center text-sm font-bold tracking-widest text-gray-900"
            >
              ${translateText("mineclash.menu_joined")}
            </span>`
          : nothing}
      </button>
    </div>`;
  }

  private tile(label: string, bg: string, onClick: () => void, badge = 0) {
    return html`<button
      class="${TILE} ${bg}"
      ?disabled=${this.disabled}
      @click=${onClick}
    >
      ${label}
      ${badge > 0
        ? html`<span
            class="absolute -right-2 -top-2 flex min-w-[1.375rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold"
            >${badge}</span
          >`
        : nothing}
    </button>`;
  }

  render() {
    const games = this.lobbies?.games;
    const stakeLobby = pickStakeLobby(games);
    const freeLobby = pickFreeLobby(games);
    return html`<div
      class="mx-auto flex w-full flex-col gap-4 px-4 pb-4 sm:px-0"
    >
      <player-of-the-day></player-of-the-day>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        ${this.card(
          "mineclash.menu_next_stake",
          stakeLobby,
          // mineclash #23: the stake comes from the lobby once it has one.
          stakeLobby ? { coins: 0 } : null,
          translateText("mineclash.menu_stake_soon"),
        )}
        ${this.card(
          "mineclash.menu_next_free",
          freeLobby,
          null,
          this.lobbies === null
            ? this.feedMessage === nothing
              ? html`<span
                  class="size-12 animate-spin rounded-full border-4 border-malibu-blue/30 border-t-malibu-blue"
                ></span>`
              : this.feedMessage
            : translateText("mineclash.menu_no_lobby"),
        )}
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        ${this.tile(translateText("main.solo"), "bg-frame-orange", this.onSolo)}
        ${this.tile(
          translateText("main.create"),
          "bg-surface border border-white/10",
          this.onHost,
        )}
        ${this.tile(
          translateText("main.join"),
          "bg-surface border border-white/10",
          this.onJoinList,
          this.hostedCount,
        )}
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        ${this.tile(
          translateText("main.tutorial"),
          "bg-cyber-yellow !text-gray-900",
          this.onTutorial,
        )}
        <a href="#modal=rules" class="${TILE} bg-malibu-blue"
          >${translateText("mineclash.menu_instructions")}</a
        >
        <a
          href="#modal=history"
          class="${TILE} bg-surface border border-white/10"
          >${translateText("mineclash.history_title")}</a
        >
      </div>
    </div>`;
  }
}
