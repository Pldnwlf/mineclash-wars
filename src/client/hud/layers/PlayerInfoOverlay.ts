import { TileRef } from "@openfront/engine-api/game/GameMap";
import { PlayerProfile, UnitType } from "@openfront/engine-api/game/GameTypes";
import { UnitLike } from "@openfront/engine-api/game/ReadViews";
import { renderTroops } from "@openfront/engine-lib/Format";
import { assetUrl } from "@openfront/shared/AssetUrls";
import { EventBus } from "@openfront/shared/EventBus";
import { html, LitElement, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { Controller } from "../../Controller";
import {
  ContextMenuEvent,
  DoBoatAttackEvent,
  DoBreakAllianceEvent,
  DoRequestAllianceEvent,
  DoTargetPlayerEvent,
  MouseMoveEvent,
  TouchEvent,
} from "../../InputHandler";
import { renderPlayerInfoCard } from "../../mineclash/PlayerInfoCard";
import { Platform } from "../../Platform";
import { TransformHandler } from "../../TransformHandler";
import { UserSettings } from "../../UserSettings";
import { formatKeyForDisplay, translateText } from "../../Utils";
import { GameView, PlayerView, UnitView } from "../../view";
import { ShowPlayerChatEvent } from "./ChatModal";
import { ShowPlayerEmojiMenuEvent } from "./EmojiTable";
import { ImmunityBarVisibleEvent } from "./ImmunityTimer";
import { CloseRadialMenuEvent } from "./RadialMenu";
import "./RelationSmiley";
import { SpawnBarVisibleEvent } from "./SpawnTimer";
const emojiIcon = assetUrl("images/EmojiIconWhite.svg");
const chatIcon = assetUrl("images/ChatIconWhite.svg");
const requestAllianceIcon = assetUrl("images/AllianceIconWhite.svg");
const breakAllianceIcon = assetUrl("images/TraitorIconWhite.svg");
const targetIcon = assetUrl("images/TargetIconWhite.svg");
const boatIcon = assetUrl("images/BoatIconWhite.svg");

function euclideanDistWorld(
  coord: { x: number; y: number },
  tileRef: TileRef,
  game: GameView,
): number {
  const x = game.x(tileRef);
  const y = game.y(tileRef);
  const dx = coord.x - x;
  const dy = coord.y - y;
  return Math.sqrt(dx * dx + dy * dy);
}

function distSortUnitWorld(coord: { x: number; y: number }, game: GameView) {
  return (a: UnitLike, b: UnitLike) => {
    const distA = euclideanDistWorld(coord, a.tile(), game);
    const distB = euclideanDistWorld(coord, b.tile(), game);
    return distA - distB;
  };
}

@customElement("player-info-overlay")
export class PlayerInfoOverlay extends LitElement implements Controller {
  @property({ type: Object })
  public game!: GameView;

  @property({ type: Object })
  public eventBus!: EventBus;

  @property({ type: Object })
  public transform!: TransformHandler;

  @state()
  private player: PlayerView | null = null;
  /** The tile the panel was shown for; the action buttons act on it. */
  private tile: TileRef | null = null;
  /** What I can do to the hovered player, for its action buttons. */
  @state() private playerActions: {
    player: PlayerView;
    requestAlliance: boolean;
    breakAlliance: boolean;
    target: boolean;
    boat: boolean;
  } | null = null;
  private playerActionsFor: PlayerView | null = null;
  private playerActionsFetchedAt = 0;
  /** Bumped per fetch and per action I take; older answers are dropped. */
  private playerActionsVersion = 0;

  @state()
  private playerProfile: PlayerProfile | null = null;

  @state()
  private unit: UnitView | null = null;

  @state()
  private _isInfoVisible: boolean = false;

  @state()
  private spawnBarVisible = false;
  @state()
  private immunityBarVisible = false;

  private _isActive = false;

  private userSettings = new UserSettings();

  // The shortcut buttons (chat and emoji on the left, player actions on the
  // right, and the panel width they need) only show on wide screens with a
  // mouse: narrower, the wider panel covers other HUD like the leaderboard,
  // and touch devices have no keyboard shortcut to show.
  private showShortcutButtons(): boolean {
    return window.innerWidth >= 1200 && !Platform.isTouch;
  }

  private get barOffset(): number {
    return (this.spawnBarVisible ? 7 : 0) + (this.immunityBarVisible ? 7 : 0);
  }

  private lastMouseUpdate = 0;

  init() {
    this.eventBus.on(MouseMoveEvent, (e: MouseMoveEvent) =>
      this.onMouseEvent(e),
    );
    this.eventBus.on(ContextMenuEvent, (e: ContextMenuEvent) =>
      this.maybeShow(e.x, e.y),
    );
    this.eventBus.on(TouchEvent, (e: TouchEvent) => this.maybeShow(e.x, e.y));
    this.eventBus.on(CloseRadialMenuEvent, () => this.hide());
    this.eventBus.on(SpawnBarVisibleEvent, (e) => {
      this.spawnBarVisible = e.visible;
    });
    this.eventBus.on(ImmunityBarVisibleEvent, (e) => {
      this.immunityBarVisible = e.visible;
    });
    this.eventBus.on(DoRequestAllianceEvent, (e) =>
      this.markActionTaken(e.tile, "requestAlliance"),
    );
    this.eventBus.on(DoBreakAllianceEvent, (e) =>
      this.markActionTaken(e.tile, "breakAlliance"),
    );
    this.eventBus.on(DoTargetPlayerEvent, (e) =>
      this.markActionTaken(e.tile, "target"),
    );
    this._isActive = true;
  }

  // Once I act on the shown player (button or keybind), drop that button
  // right away: the game only sees the intent a turn later, so asking now
  // would still offer it. The next refresh, a second later, shows the real
  // state. A keybind (no tile) acts under the cursor, which is the shown
  // player unless the pointer is on the panel.
  private markActionTaken(
    tile: TileRef | undefined,
    action: "requestAlliance" | "breakAlliance" | "target",
  ) {
    const actions = this.playerActions;
    if (!actions || actions.player !== this.player) return;
    const onShownPlayer =
      tile === undefined
        ? this._isInfoVisible && !this.pointerOnPanel
        : tile === this.tile;
    if (!onShownPlayer) return;
    this.playerActionsVersion++;
    this.playerActionsFetchedAt = Date.now();
    this.playerActions = { ...actions, [action]: false };
  }

  // While the pointer is on the panel (moving to its emoji button), keep the
  // target: mouse moves still arrive from the window, and the tile under the
  // panel would otherwise retarget or hide it.
  private pointerOnPanel = false;
  private onPanelEnter = () => (this.pointerOnPanel = true);
  private onPanelLeave = () => (this.pointerOnPanel = false);

  private onMouseEvent(event: MouseMoveEvent) {
    if (this.pointerOnPanel) {
      return;
    }
    const now = Date.now();
    if (now - this.lastMouseUpdate < 100) {
      return;
    }
    this.lastMouseUpdate = now;
    this.maybeShow(event.x, event.y);
  }

  public hide() {
    this.pointerOnPanel = false;
    this.setVisible(false);
    this.unit = null;
    this.player = null;
  }

  public maybeShow(x: number, y: number) {
    this.hide();
    const worldCoord = this.transform.screenToWorldCoordinates(x, y);
    if (!this.game.isValidCoord(worldCoord.x, worldCoord.y)) {
      return;
    }

    const tile = this.game.ref(worldCoord.x, worldCoord.y);
    if (!tile) return;

    const owner = this.game.owner(tile);

    if (owner && owner.isPlayer()) {
      this.player = owner as PlayerView;
      this.tile = tile;
      this.player.profile().then((p) => {
        this.playerProfile = p;
      });
      this.refreshPlayerActions(this.player, tile);
      this.setVisible(true);
    } else if (!this.game.isLand(tile)) {
      const units = this.game
        .units(UnitType.Warship, UnitType.TradeShip, UnitType.TransportShip)
        .filter((u) => euclideanDistWorld(worldCoord, u.tile(), this.game) < 50)
        .sort(distSortUnitWorld(worldCoord, this.game));

      if (units.length > 0) {
        this.unit = units[0];
        this.setVisible(true);
      }
    }
  }

  // Asks what I can do to the hovered player when it changes, and at most
  // once a second while it stays (alliances and boat reach change in play).
  private refreshPlayerActions(player: PlayerView, tile: TileRef) {
    const myPlayer = this.game.myPlayer();
    if (!myPlayer || player === myPlayer || !this.showShortcutButtons()) {
      return;
    }
    // No buttons while players spawn (the game would drop the actions), or
    // once the shown tile has changed hands (the answer would be about its
    // new owner).
    if (this.game.inSpawnPhase() || this.game.owner(tile) !== player) {
      this.playerActionsVersion++;
      this.playerActionsFor = null;
      this.playerActions = null;
      return;
    }
    const now = Date.now();
    if (
      this.playerActionsFor === player &&
      now - this.playerActionsFetchedAt < 1000
    ) {
      return;
    }
    this.playerActionsFor = player;
    this.playerActionsFetchedAt = now;
    const version = ++this.playerActionsVersion;
    myPlayer
      .actions(tile, [UnitType.TransportShip])
      .then((actions) => {
        if (version !== this.playerActionsVersion) return;
        const can = actions.interaction;
        this.playerActions = {
          player,
          requestAlliance: can?.canSendAllianceRequest ?? false,
          breakAlliance: can?.canBreakAlliance ?? false,
          target: can?.canTarget ?? false,
          boat: actions.buildableUnits.some(
            (u) => u.type === UnitType.TransportShip && u.canBuild !== false,
          ),
        };
      })
      .catch((error) => {
        console.warn("Failed to check player actions:", error);
      });
  }

  tick() {
    // Keep the action buttons current while the mouse rests on a player.
    if (this._isInfoVisible && this.player && this.tile !== null) {
      this.refreshPlayerActions(this.player, this.tile);
    }
    this.requestUpdate();
  }

  setVisible(visible: boolean) {
    this._isInfoVisible = visible;
    this.requestUpdate();
  }

  private renderShortcutButton(
    icon: string,
    title: string,
    keybind: string | undefined,
    onClick: () => void,
  ) {
    const key = keybind ? formatKeyForDisplay(keybind) : "";
    // Icon only, with the key as a corner badge, to keep the panel narrow.
    return html`<button
      class="relative flex items-center justify-center size-6.5 border rounded-md border-gray-500 hover:bg-white/10 cursor-pointer"
      title=${title}
      @click=${(e: MouseEvent) => {
        e.stopPropagation();
        onClick();
        this.hide();
      }}
    >
      <img src=${icon} alt="" class="size-5 object-contain" />
      ${key
        ? html`<span
            class="pointer-events-none absolute -bottom-1 -right-1 px-0.5 rounded-sm bg-gray-800 text-[9px] leading-tight font-mono text-gray-300"
            translate="no"
            >${key}</span
          >`
        : ""}
    </button>`;
  }

  // mineclash #12: FrontWars-style card (src/client/mineclash/PlayerInfoCard.ts)
  // with the shortcut and action buttons as a footer row.
  private renderPlayerInfo(player: PlayerView) {
    const myPlayer = this.game.myPlayer();
    const keybinds = this.userSettings.keybinds(Platform.isMac);
    const footer =
      myPlayer && this.showShortcutButtons()
        ? html`<div class="flex flex-wrap items-center justify-end gap-1 pt-1">
            ${player !== myPlayer
              ? this.renderShortcutButton(
                  chatIcon,
                  translateText("player_panel.chat"),
                  keybinds.quickChat,
                  () => this.eventBus.emit(new ShowPlayerChatEvent(player)),
                )
              : ""}
            ${this.renderShortcutButton(
              emojiIcon,
              translateText("player_panel.emotes"),
              keybinds.emojiMenu,
              () => this.eventBus.emit(new ShowPlayerEmojiMenuEvent(player)),
            )}
            ${this.renderActionButtons(player, myPlayer, keybinds)}
          </div>`
        : "";
    return renderPlayerInfoCard(this.game, player, this.playerProfile, footer);
  }

  // Right side: what I can do to the player, each with its keybind. Request
  // and break alliance share a slot, as only one applies at a time. The
  // column keeps its width when empty, so the panel doesn't shift.
  private renderActionButtons(
    player: PlayerView,
    myPlayer: PlayerView,
    keybinds: Record<string, string>,
  ) {
    const can =
      player !== myPlayer && this.playerActions?.player === player
        ? this.playerActions
        : null;
    const tile = this.tile ?? undefined;
    const buttons: TemplateResult[] = [];
    if (can?.requestAlliance) {
      buttons.push(
        this.renderShortcutButton(
          requestAllianceIcon,
          translateText("player_panel.send_alliance"),
          keybinds.requestAlliance,
          () =>
            this.eventBus.emit(new DoRequestAllianceEvent(tile, player.id())),
        ),
      );
    } else if (can?.breakAlliance) {
      buttons.push(
        this.renderShortcutButton(
          breakAllianceIcon,
          translateText("player_panel.break_alliance"),
          keybinds.breakAlliance,
          () => this.eventBus.emit(new DoBreakAllianceEvent(tile, player.id())),
        ),
      );
    }
    if (can?.target) {
      buttons.push(
        this.renderShortcutButton(
          targetIcon,
          translateText("player_panel.target"),
          keybinds.targetPlayer,
          () => this.eventBus.emit(new DoTargetPlayerEvent(tile, player.id())),
        ),
      );
    }
    if (can?.boat) {
      buttons.push(
        this.renderShortcutButton(
          boatIcon,
          translateText("user_setting.boat_attack"),
          keybinds.boatAttack,
          () => this.eventBus.emit(new DoBoatAttackEvent(tile)),
        ),
      );
    }
    return html`<div class="contents">${buttons}</div>`;
  }

  private renderUnitInfo(unit: UnitView) {
    const isAlly =
      (unit.owner() === this.game.myPlayer() ||
        this.game.myPlayer()?.isFriendly(unit.owner())) ??
      false;

    return html`
      <div class="p-2">
        <div class="font-bold mb-1 ${isAlly ? "text-green-500" : "text-white"}">
          ${unit.owner().displayName()}
        </div>
        <div class="mt-1">
          <div class="text-sm opacity-80">${unit.type()}</div>
          ${unit.hasHealth()
            ? html` <div class="text-sm">Health: ${unit.health()}</div> `
            : ""}
          ${unit.type() === UnitType.TransportShip
            ? html`
                <div class="text-sm">
                  Troops: ${renderTroops(unit.troops())}
                </div>
              `
            : ""}
        </div>
      </div>
    `;
  }

  render() {
    if (!this._isActive) {
      return html``;
    }

    const containerClasses = this._isInfoVisible
      ? `opacity-100 visible ${this.showShortcutButtons() ? "pointer-events-auto" : ""}`
      : "opacity-0 invisible";

    return html`
      <div
        class="fixed top-14 right-0 z-[1001] ${this.showShortcutButtons()
          ? "w-56"
          : "w-44 lg:w-56"} pointer-events-none"
        style="margin-top: ${this.barOffset}px;"
        @click=${() => this.hide()}
        @contextmenu=${(e: MouseEvent) => e.preventDefault()}
      >
        <div
          class="bg-gray-800/92 backdrop-blur-sm shadow-xs rounded-l-lg shadow-lg text-white overflow-hidden ${containerClasses}"
          @mouseenter=${this.onPanelEnter}
          @mouseleave=${this.onPanelLeave}
        >
          ${this.player ? this.renderPlayerInfo(this.player) : ""}
          ${this.unit ? this.renderUnitInfo(this.unit) : ""}
        </div>
      </div>
    `;
  }

  createRenderRoot() {
    return this; // Disable shadow DOM to allow Tailwind styles
  }
}
