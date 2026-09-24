import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { keyed } from "lit/directives/keyed.js";
import { assetUrl } from "../../../core/AssetUrls";
import { EventBus } from "../../../core/EventBus";
import { ClientID } from "../../../core/Schemas";
import { Config } from "../../../core/configuration/Config";
import { GameMode, GameType, Gold } from "../../../core/game/Game";
import { TileRef } from "../../../core/game/GameMap";
import { GameUpdateType } from "../../../core/game/GameUpdates";
import {
  USER_SETTINGS_CHANGED_EVENT,
  UserSettings,
} from "../../../core/game/UserSettings";
import { Controller } from "../../Controller";
import { AttackRatioEvent } from "../../InputHandler";
import { UIState } from "../../UIState";
import {
  getGamesPlayed,
  renderNumber,
  renderTroops,
  translateText,
} from "../../Utils";
import { GameView } from "../../view";
import { PlayerView } from "../../view/PlayerView";
import { goldCoinIcon, soldierIcon } from "../HotbarIcons";
import { TutorialHighlight, TutorialHighlightEvent } from "../Tutorial";
const swordIcon = assetUrl("images/SwordIcon.svg");

@customElement("control-panel")
export class ControlPanel extends LitElement implements Controller {
  public game: GameView;
  public clientID: ClientID;
  public eventBus: EventBus;
  public uiState: UIState;

  @state()
  private attackRatio: number = 0.2;

  @state()
  private donateTroopRatio: number = 0.1;

  @state()
  private donateGoldRatio: number = 0.1;

  @state()
  private _maxTroops: number;

  @state()
  private troopRate: number;

  @state()
  private _troops: number;

  @state()
  private _isVisible = false;

  @state()
  private _notification: { type: "warning" | "info"; message: string } | null =
    null;

  @state()
  private _gold: Gold;

  @state()
  private _attackingTroops: number = 0;

  @state()
  private _goldGain: bigint | null = null;
  @state()
  private _goldGainPulseId: number = 0;
  private _goldGainTimeoutId: ReturnType<typeof setTimeout> | null = null;

  @state()
  private _tutorialHighlight: TutorialHighlight | null = null;

  private _troopRateIsIncreasing: boolean = true;

  private _lastTroopIncreaseRate: number;

  // Border detection cache
  private _nearbyPlayerIDs: Set<number> = new Set();
  private _borderRefreshCounter: number = 0;
  private _borderTilesPromise: Promise<void> | null = null;
  // Track last attack tick per target player (for 15-second threshold)
  private _lastAttackTickByTarget: Map<number, number> = new Map();
  private static readonly BORDER_REFRESH_INTERVAL = 10; // recompute every 1s
  private static readonly ATTACK_THRESHOLD_TICKS = 15 * 10; // 15 seconds

  connectedCallback() {
    super.connectedCallback();
    // The attack ratio is cached below for the lifetime of the game, but the
    // settings modal is now reachable mid-match, so follow the stored value
    // when it changes there. (This panel's own slider is session-only: it
    // never writes UserSettings, so there is no loop.)
    globalThis.addEventListener(
      `${USER_SETTINGS_CHANGED_EVENT}:settings.attackRatio`,
      this.onAttackRatioSettingChanged,
    );
  }

  init() {
    this.attackRatio = new UserSettings().attackRatio();
    this.uiState.attackRatio = this.attackRatio;
    this.donateTroopRatio = this.uiState.donateTroopRatio ?? 0.1;
    this.donateGoldRatio = this.uiState.donateGoldRatio ?? 0.1;
    this.eventBus.on(TutorialHighlightEvent, (e) => {
      this._tutorialHighlight = e.target;
    });
    this.eventBus.on(AttackRatioEvent, (event) => {
      let newAttackRatio = this.attackRatio + event.attackRatio / 100;

      if (newAttackRatio < 0.01) {
        newAttackRatio = 0.01;
      }

      if (newAttackRatio > 1) {
        newAttackRatio = 1;
      }

      if (newAttackRatio === 0.11 && this.attackRatio === 0.01) {
        // If we're changing the ratio from 1%, then set it to 10% instead of 11% to keep a consistency
        newAttackRatio = 0.1;
      }

      this.attackRatio = newAttackRatio;
      this.onAttackRatioChange(this.attackRatio);
    });
  }

  tick() {
    if (!this._isVisible && !this.game.inSpawnPhase()) {
      this.setVisibile(true);
    }

    const player = this.game.myPlayer();
    if (player === null || !player.isAlive()) {
      this.setVisibile(false);
      return;
    }

    this.updateTroopIncrease();

    const config = this.game.config();
    this._maxTroops = config.maxTroops(player);
    this._gold = player.gold();
    this._troops = player.troops();
    this._attackingTroops = player
      .outgoingAttacks()
      .map((a) => a.troops)
      .reduce((a, b) => a + b, 0);
    this.troopRate = config.troopIncreaseRate(player) * 10;

    const helpEnabled = new UserSettings().helpMessages();

    // Don't target veteran players
    if (helpEnabled && getGamesPlayed() < 20) {
      // Track outgoing attacks for 15-second threshold
      this.trackOutgoingAttacks(player);

      // Refresh border detection cache periodically
      this.refreshNearbyPlayers(player);

      // Compute notification
      this._notification = this.computeNotification(player, config);
    }

    const updates = this.game.updatesSinceLastTick();
    if (updates) {
      const myID = player.id();
      const bonusEvents = updates[GameUpdateType.BonusEvent];
      if (bonusEvents) {
        for (const ev of bonusEvents) {
          if (ev.player === myID && ev.gold > 0) {
            this.addGoldGain(BigInt(ev.gold));
          }
        }
      }
      const conquestEvents = updates[GameUpdateType.ConquestEvent];
      if (conquestEvents) {
        for (const ev of conquestEvents) {
          if (ev.conquerorId === myID && ev.gold > 0n) {
            this.addGoldGain(ev.gold);
          }
        }
      }
      const donateEvents = updates[GameUpdateType.DonateEvent];
      if (donateEvents) {
        for (const ev of donateEvents) {
          if (
            ev.donationType === "gold" &&
            ev.recipientId === myID &&
            ev.amount > 0n
          ) {
            this.addGoldGain(ev.amount);
          }
        }
      }
    }

    this.requestUpdate();
  }

  // Last-wins: when multiple gold events arrive in one tick, the pip shows
  // only the most recent amount (not a sum) — each gain restarts the pulse.
  private addGoldGain(amount: bigint) {
    this._goldGain = amount;
    this._goldGainPulseId++;
    if (this._goldGainTimeoutId !== null) {
      clearTimeout(this._goldGainTimeoutId);
    }
    this._goldGainTimeoutId = setTimeout(() => {
      this._goldGain = null;
      this._goldGainTimeoutId = null;
      this.requestUpdate();
    }, 2000);
  }

  private trackOutgoingAttacks(player: PlayerView) {
    const currentTick = this.game.ticks();
    for (const attack of player.outgoingAttacks()) {
      if (attack.targetID !== 0 && !attack.retreating) {
        this._lastAttackTickByTarget.set(attack.targetID, currentTick);
      }
    }
    // Clean up old entries
    for (const [playerID, tick] of this._lastAttackTickByTarget.entries()) {
      if (currentTick - tick > ControlPanel.ATTACK_THRESHOLD_TICKS * 2) {
        this._lastAttackTickByTarget.delete(playerID);
      }
    }
  }

  private refreshNearbyPlayers(player: PlayerView) {
    this._borderRefreshCounter++;
    if (
      this._borderRefreshCounter < ControlPanel.BORDER_REFRESH_INTERVAL ||
      this._borderTilesPromise !== null
    ) {
      return;
    }
    this._borderRefreshCounter = 0;
    this._borderTilesPromise = player.borderTiles().then((bt) => {
      this._borderTilesPromise = null;
      const myID = player.smallID();
      const nearby = new Set<number>();
      for (const tile of bt.borderTiles) {
        for (const neighbor of this.game.neighbors(tile as TileRef)) {
          const ownerID = this.game.ownerID(neighbor);
          if (ownerID !== 0 && ownerID !== myID) {
            nearby.add(ownerID);
          }
        }
      }
      this._nearbyPlayerIDs = nearby;
    });
  }

  private computeNotification(
    player: PlayerView,
    config: Config,
  ): { type: "warning" | "info"; message: string } | null {
    const currentTick = this.game.ticks();

    // Army limit warning
    const { gameMode, gameType } = config.gameConfig();
    const isPublicTeamGame =
      gameMode === GameMode.Team && gameType === GameType.Public;
    const canDonateTroops = config.donateTroops();
    if (isPublicTeamGame && canDonateTroops) {
      const ratio = this._troops / Math.max(this._maxTroops, 1);
      if (ratio >= config.armyLimitWarningThreshold()) {
        return {
          type: "warning",
          message: "control_panel.army_limit_warning",
        };
      }
    }

    // Low troops (Less than 1k) warning
    if (this._troops < 10000 && this._troops > 0) {
      return { type: "warning", message: "control_panel.low_troops_warning" };
    }

    // Info messages: check nearby players for traitors, AFK allies, AFK teammates
    for (const nearbyID of this._nearbyPlayerIDs) {
      let other;
      try {
        other = this.game.playerBySmallID(nearbyID);
      } catch {
        continue;
      }
      if (!other.isPlayer() || !other.isAlive()) continue;

      const lastAttackTick = this._lastAttackTickByTarget.get(nearbyID) ?? -1;
      const secondsSinceAttack = (currentTick - lastAttackTick) / 10;
      const hasNotAttackedRecently =
        lastAttackTick < 0 || secondsSinceAttack > 15;

      if (!hasNotAttackedRecently) continue;

      if (other.isTraitor() && player.isAlliedWith(other)) {
        return { type: "info", message: "control_panel.traitor_neighbor_info" };
      }
      if (other.isDisconnected() && player.isAlliedWith(other)) {
        return {
          type: "info",
          message: "control_panel.allied_afk_neighbor_info",
        };
      }
      if (other.isDisconnected() && player.isOnSameTeam(other)) {
        return {
          type: "info",
          message: "control_panel.teammate_afk_neighbor_info",
        };
      }
    }

    return null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    globalThis.removeEventListener(
      `${USER_SETTINGS_CHANGED_EVENT}:settings.attackRatio`,
      this.onAttackRatioSettingChanged,
    );
    if (this._goldGainTimeoutId !== null) {
      clearTimeout(this._goldGainTimeoutId);
      this._goldGainTimeoutId = null;
    }
  }

  private updateTroopIncrease() {
    const player = this.game?.myPlayer();
    if (player === null) return;
    const troopIncreaseRate = this.game.config().troopIncreaseRate(player);
    this._troopRateIsIncreasing =
      troopIncreaseRate >= this._lastTroopIncreaseRate;
    this._lastTroopIncreaseRate = troopIncreaseRate;
  }

  onAttackRatioChange(newRatio: number) {
    this.uiState.attackRatio = newRatio;
  }

  private onAttackRatioSettingChanged = () => {
    // The element outlives any one game; uiState only exists once init() ran.
    if (this.uiState === undefined) return;
    this.attackRatio = new UserSettings().attackRatio();
    this.onAttackRatioChange(this.attackRatio);
    this.requestUpdate();
  };

  setVisibile(visible: boolean) {
    this._isVisible = visible;
    this.requestUpdate();
  }

  private handleRatioSliderInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = Number(input.value);
    this.attackRatio = value / 100;
    this.onAttackRatioChange(this.attackRatio);
  }

  private handleDonateTroopSliderInput(e: Event) {
    this.donateTroopRatio = Number((e.target as HTMLInputElement).value) / 100;
    this.uiState.donateTroopRatio = this.donateTroopRatio;
  }

  private handleDonateGoldSliderInput(e: Event) {
    this.donateGoldRatio = Number((e.target as HTMLInputElement).value) / 100;
    this.uiState.donateGoldRatio = this.donateGoldRatio;
  }

  private handleRatioSliderPointerUp(e: Event) {
    (e.target as HTMLInputElement).blur();
  }

  private calculateTroopBar(): { greenPercent: number; orangePercent: number } {
    const base = Math.max(this._maxTroops, 1);
    const greenPercentRaw = (this._troops / base) * 100;
    const orangePercentRaw = (this._attackingTroops / base) * 100;

    const greenPercent = Math.max(0, Math.min(100, greenPercentRaw));
    const orangePercent = Math.max(
      0,
      Math.min(100 - greenPercent, orangePercentRaw),
    );

    return { greenPercent, orangePercent };
  }

  private renderMobileTroopBar() {
    const { greenPercent, orangePercent } = this.calculateTroopBar();
    return html`
      <div
        class="w-full h-6 border border-gray-600 rounded-md bg-gray-900/60 overflow-hidden relative"
      >
        <div class="relative h-full">
          <div
            class="absolute inset-y-0 left-0 w-full origin-left bg-malibu-blue transition-transform duration-200 ease-out"
            style="transform: scaleX(${greenPercent / 100});"
          ></div>
          <div
            class="absolute inset-y-0 left-0 w-full origin-left bg-aquarius transition-transform duration-200 ease-out"
            style="transform: translateX(${greenPercent}%) scaleX(${orangePercent /
            100});"
          ></div>
        </div>
        <div
          class="absolute inset-0 flex items-center justify-between px-1.5 text-xs font-bold leading-none pointer-events-none"
          translate="no"
        >
          <span class="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
            >${renderTroops(this._troops)}</span
          >
          <span class="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
            >${renderTroops(this._maxTroops)}</span
          >
        </div>
        <div
          class="absolute inset-0 flex items-center justify-center pointer-events-none"
          translate="no"
        >
          <div
            class="flex items-center gap-0.5 px-1 ${this.tutorialHighlightClass(
              "troop_rate",
            )}"
          >
            <img
              src=${soldierIcon}
              alt=""
              aria-hidden="true"
              width="12"
              height="12"
              class="brightness-0 invert drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]"
            />
            <span
              class="text-[10px] font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)] ${this
                ._troopRateIsIncreasing
                ? "text-green-400"
                : "text-orange-400"}"
              >+${renderTroops(this.troopRate)}/s</span
            >
          </div>
        </div>
      </div>
    `;
  }

  private tutorialHighlightClass(target: TutorialHighlight): string {
    return this._tutorialHighlight === target ? "tutorial-highlight" : "";
  }

  private renderNotification() {
    if (!this._notification) return html``;
    const isWarning = this._notification.type === "warning";
    return html`
      <div
        class="flex items-center gap-1.5 px-1.5 py-1 rounded-md border text-xs font-medium mb-1 ${isWarning
          ? "border-orange-400/60 bg-orange-400/10 text-orange-300"
          : "border-blue-400/60 bg-blue-400/10 text-blue-300"}"
      >
        <span class="shrink-0">${isWarning ? "⚠" : "ℹ"}</span>
        <span>${translateText(this._notification.message)}</span>
      </div>
    `;
  }

  // One labelled slider row: "Attack Ratio:      20% (1.9K)" above the track.
  private renderRatioSlider(
    label: string,
    ratio: number,
    amount: string,
    accent: string,
    onInput: (e: Event) => void,
    highlight = "",
  ) {
    return html`
      <div class="mt-2 ${highlight}" translate="no">
        <div class="flex justify-between text-sm text-white/80">
          <span>${label}:</span>
          <span class="font-bold text-white tabular-nums"
            >${Math.round(ratio * 100)}% (${amount})</span
          >
        </div>
        <input
          type="range"
          min="1"
          max="100"
          .value=${String(Math.round(ratio * 100))}
          @input=${onInput}
          @pointerup=${(e: Event) => this.handleRatioSliderPointerUp(e)}
          class="w-full h-1.5 cursor-pointer ${accent}"
        />
      </div>
    `;
  }

  private renderDesktop() {
    const config = this.game?.config();
    const troops = this.game?.myPlayer()?.troops() ?? 0;
    return html`
      ${this.renderNotification()}
      <!-- Stats box: troops (+rate) and gold -->
      <div
        class="rounded-md bg-black/30 px-3 py-2 space-y-1 text-sm"
        translate="no"
      >
        <div
          class="flex justify-between items-baseline ${this.tutorialHighlightClass(
            "troops",
          )}"
        >
          <span class="text-white/80"
            >${translateText("control_panel.troops")}:</span
          >
          <span class="font-bold text-white tabular-nums"
            >${renderTroops(this._troops)} / ${renderTroops(this._maxTroops)}
            <span
              class="${this.tutorialHighlightClass("troop_rate")} ${this
                ._troopRateIsIncreasing
                ? "text-green-400"
                : "text-orange-400"}"
              >(+${renderTroops(this.troopRate)})</span
            ></span
          >
        </div>
        <div
          class="flex justify-between items-baseline relative ${this.tutorialHighlightClass(
            "gold",
          )}"
        >
          <span class="text-white/80"
            >${translateText("control_panel.gold")}:</span
          >
          ${this._goldGain !== null
            ? keyed(
                this._goldGainPulseId,
                html`<span
                  class="gold-gain-pop absolute -top-5 right-0 text-green-400 text-sm font-extrabold tabular-nums whitespace-nowrap pointer-events-none drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)]"
                  >+${renderNumber(this._goldGain)}</span
                >`,
              )
            : ""}
          <span class="font-bold text-white tabular-nums"
            >${renderNumber(this._gold)}</span
          >
        </div>
      </div>
      ${this.renderRatioSlider(
        translateText("control_panel.attack_ratio"),
        this.attackRatio,
        renderTroops(troops * this.attackRatio),
        "accent-red-500",
        (e) => this.handleRatioSliderInput(e),
        this.tutorialHighlightClass("attack_ratio"),
      )}
      ${config?.donateTroops()
        ? this.renderRatioSlider(
            translateText("control_panel.donate_troops"),
            this.donateTroopRatio,
            renderTroops(troops * this.donateTroopRatio),
            "accent-blue-500",
            (e) => this.handleDonateTroopSliderInput(e),
          )
        : ""}
      ${config?.donateGold()
        ? this.renderRatioSlider(
            translateText("control_panel.donate_gold"),
            this.donateGoldRatio,
            renderNumber(
              ((this._gold ?? 0n) *
                BigInt(Math.round(this.donateGoldRatio * 100))) /
                100n,
            ),
            "accent-yellow-400",
            (e) => this.handleDonateGoldSliderInput(e),
          )
        : ""}
    `;
  }

  private renderMobile() {
    return html`
      ${this.renderNotification()}
      <div class="flex gap-2 items-center">
        <!-- Gold -->
        <div
          class="flex items-center justify-center p-1 gap-0.5 border rounded-md border-yellow-400 font-bold text-yellow-400 text-xs w-1/5 shrink-0 relative ${this.tutorialHighlightClass(
            "gold",
          )}"
          translate="no"
        >
          ${this._goldGain !== null
            ? keyed(
                this._goldGainPulseId,
                html`<span
                  class="gold-gain-pop absolute -top-5 right-[5px] min-[1015px]:right-[9px] text-green-400 text-xs font-extrabold tabular-nums whitespace-nowrap pointer-events-none drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)]"
                  >+${renderNumber(this._goldGain)}</span
                >`,
              )
            : ""}
          <img src=${goldCoinIcon} width="13" height="13" />
          <span class="px-0.5">${renderNumber(this._gold)}</span>
        </div>
        <!-- Troop bar -->
        <div
          class="w-[40%] shrink-0 flex items-center ${this.tutorialHighlightClass(
            "troops",
          )}"
        >
          ${this.renderMobileTroopBar()}
        </div>
        <!-- Sword + % label -->
        <div
          class="flex flex-col items-center shrink-0 gap-0.5 w-8"
          translate="no"
        >
          <img
            src=${swordIcon}
            alt=""
            aria-hidden="true"
            width="10"
            height="10"
            style="filter: brightness(0) invert(1);"
          />
          <span class="text-white text-xs font-bold tabular-nums"
            >${(this.attackRatio * 100).toFixed(0)}%</span
          >
        </div>
        <!-- Attack ratio slider -->
        <div
          class="flex-1 ${this.tutorialHighlightClass("attack_ratio")}"
          translate="no"
        >
          <input
            type="range"
            min="1"
            max="100"
            .value=${String(Math.round(this.attackRatio * 100))}
            @input=${(e: Event) => this.handleRatioSliderInput(e)}
            @pointerup=${(e: Event) => this.handleRatioSliderPointerUp(e)}
            class="w-full h-1.5 accent-aquarius cursor-pointer"
          />
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <style>
        @keyframes gold-gain-pop {
          0% {
            transform: translateY(4px);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .gold-gain-pop {
          animation: gold-gain-pop 0.25s ease-out;
        }
      </style>
      <div
        class="relative pointer-events-auto ${this._isVisible
          ? "relative w-full text-sm px-2 py-1 lg:px-3 lg:py-3 lg:bg-gray-800/92 lg:backdrop-blur-sm lg:rounded-lg lg:shadow-lg"
          : "hidden"}"
        @contextmenu=${(e: MouseEvent) => e.preventDefault()}
      >
        <div class="lg:hidden">${this.renderMobile()}</div>
        <div class="hidden lg:block">${this.renderDesktop()}</div>
      </div>
    `;
  }

  createRenderRoot() {
    return this; // Disable shadow DOM to allow Tailwind styles
  }
}
