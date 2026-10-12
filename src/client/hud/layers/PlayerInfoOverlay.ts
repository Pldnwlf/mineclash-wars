import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { assetUrl } from "../../../core/AssetUrls";
import { EventBus } from "../../../core/EventBus";
import {
  PlayerProfile,
  PlayerType,
  Relation,
  Unit,
  UnitType,
} from "../../../core/game/Game";
import { TileRef } from "../../../core/game/GameMap";
import { Controller } from "../../Controller";
import {
  ContextMenuEvent,
  MouseMoveEvent,
  TouchEvent,
} from "../../InputHandler";
import { TransformHandler } from "../../TransformHandler";
import {
  renderDuration,
  renderNumber,
  renderTroops,
  translateText,
} from "../../Utils";
import { GameView, PlayerView, UnitView } from "../../view";
import {
  EMOJI_ICON_KIND,
  getFirstPlacePlayer,
  getPlayerIcons,
  IMAGE_ICON_KIND,
} from "../PlayerIcons";
import { ImmunityBarVisibleEvent } from "./ImmunityTimer";
import { CloseRadialMenuEvent } from "./RadialMenu";
import { SpawnBarVisibleEvent } from "./SpawnTimer";

const allianceIcon = assetUrl("images/AllianceIcon.svg");
const traitorIcon = assetUrl("images/TraitorIcon.svg");

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
  return (a: Unit | UnitView, b: Unit | UnitView) => {
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
    this._isActive = true;
  }

  private onMouseEvent(event: MouseMoveEvent) {
    const now = Date.now();
    if (now - this.lastMouseUpdate < 100) {
      return;
    }
    this.lastMouseUpdate = now;
    this.maybeShow(event.x, event.y);
  }

  public hide() {
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
      this.player.profile().then((p) => {
        this.playerProfile = p;
      });
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

  tick() {
    this.requestUpdate();
  }

  setVisible(visible: boolean) {
    this._isInfoVisible = visible;
    this.requestUpdate();
  }

  // mineclash #12: FrontWars-style card (labelled rows), right under the timer box.
  private relationText(
    player: PlayerView,
    myPlayer: PlayerView | null | undefined,
  ): string {
    if (myPlayer?.isAlliedWith(player)) {
      return translateText("player_info_overlay.allied");
    }
    if (!myPlayer || myPlayer === player || player.type() !== PlayerType.Nation)
      return translateText("relation.neutral");
    return this.getRelationName(
      this.playerProfile?.relations[myPlayer.smallID()] ?? Relation.Neutral,
    );
  }

  private getRelationName(relation: Relation): string {
    switch (relation) {
      case Relation.Hostile:
        return translateText("relation.hostile");
      case Relation.Distrustful:
        return translateText("relation.distrustful");
      case Relation.Neutral:
        return translateText("relation.neutral");
      case Relation.Friendly:
        return translateText("relation.friendly");
      default:
        return translateText("relation.default");
    }
  }

  private row(label: string, value: unknown, valueClass = "text-white") {
    return html`<div class="flex justify-between gap-2" translate="no">
      <span class="text-white/80">${label}:</span>
      <span class="font-bold tabular-nums ${valueClass}">${value}</span>
    </div>`;
  }

  private unitRow(player: PlayerView, type: UnitType, key: string) {
    return this.game.config().isUnitDisabled(type)
      ? ""
      : this.row(
          translateText(`player_info_overlay.${key}`),
          player.totalUnitLevels(type),
        );
  }

  private renderPlayerInfo(player: PlayerView) {
    const myPlayer = this.game.myPlayer();
    const nameClass = myPlayer?.isFriendly(player)
      ? "text-green-500"
      : "text-white";
    const attackingTroops = player
      .outgoingAttacks()
      .reduce((sum, a) => sum + a.troops, 0);
    const typeKey = {
      [PlayerType.Bot]: "bot",
      [PlayerType.Nation]: "nation",
      [PlayerType.Human]: "player",
    }[player.type()];
    const flag = player.cosmetics.flag;
    const icons = getPlayerIcons({
      game: this.game,
      player,
      firstPlace: getFirstPlacePlayer(this.game),
    });
    const traitorTicks = player.getTraitorRemainingTicks();
    const alliance = myPlayer?.alliances().find((a) => a.other === player.id());

    return html`
      <div class="px-3 py-2 space-y-1 text-sm">
        <div
          class="flex items-center gap-1.5 font-bold text-base break-all ${nameClass}"
        >
          ${flag
            ? html`<img
                class="h-6 object-contain shrink-0"
                src=${assetUrl(flag)}
              />`
            : ""}
          <span>${player.displayName()}</span>
        </div>
        ${icons.length > 0 || traitorTicks > 0 || alliance
          ? html`<div class="flex items-center gap-2 flex-wrap text-xs">
              ${icons.map((icon) =>
                icon.kind === EMOJI_ICON_KIND && icon.text
                  ? html`<span class="font-mono text-sm" translate="no"
                      >${icon.text}</span
                    >`
                  : icon.kind === IMAGE_ICON_KIND && icon.src
                    ? html`<img src=${icon.src} alt="" class="w-4 h-4" />`
                    : "",
              )}
              ${traitorTicks > 0
                ? html`<span class="flex items-center gap-1 text-red-400"
                    ><img
                      src=${traitorIcon}
                      alt=""
                      class="w-4 h-4"
                    />${renderDuration(Math.floor(traitorTicks / 10))}</span
                  >`
                : ""}
              ${alliance
                ? html`<span class="flex items-center gap-1 text-green-400"
                    ><img
                      src=${allianceIcon}
                      alt=""
                      class="w-4 h-4"
                    />${renderDuration(
                      Math.max(
                        0,
                        Math.floor(
                          (alliance.expiresAt - this.game.ticks()) / 10,
                        ),
                      ),
                    )}</span
                  >`
                : ""}
            </div>`
          : ""}
        ${this.row(
          translateText("player_info_overlay.type"),
          translateText(`player_type.${typeKey}`),
        )}
        ${this.row(
          translateText("player_info_overlay.relation"),
          this.relationText(player, myPlayer),
        )}
        ${this.row(
          translateText("player_info_overlay.troops"),
          renderTroops(player.troops()),
        )}
        ${this.row(
          translateText("player_info_overlay.attacking"),
          renderTroops(attackingTroops),
          attackingTroops > 0 ? "text-aquarius" : "text-white/60",
        )}
        <div
          class="flex justify-between items-center rounded-md bg-yellow-400/15 px-2 py-1 text-yellow-400"
          translate="no"
        >
          <span class="font-semibold"
            >${translateText("player_info_overlay.gold")}:</span
          >
          <span class="font-bold tabular-nums"
            >${renderNumber(player.gold())}</span
          >
        </div>
        ${this.unitRow(player, UnitType.City, "cities")}
        ${this.unitRow(player, UnitType.Factory, "factories")}
        ${this.unitRow(player, UnitType.Port, "ports")}
        ${this.unitRow(player, UnitType.MissileSilo, "silos")}
        ${this.unitRow(player, UnitType.SAMLauncher, "sams")}
        ${this.unitRow(player, UnitType.Warship, "warships")}
      </div>
    `;
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
      ? "opacity-100 visible"
      : "opacity-0 invisible";

    // Right edge, below the timer box (GameRightSidebar). pointer-events-none
    // so it never blocks taps/clicks on the map, also on mobile.
    return html`
      <div
        class="fixed top-14 right-0 z-[999] w-44 lg:w-56 pointer-events-none"
        style="margin-top: ${this.barOffset}px;"
        @contextmenu=${(e: MouseEvent) => e.preventDefault()}
      >
        <div
          class="bg-gray-800/92 backdrop-blur-sm shadow-lg rounded-l-lg text-white overflow-hidden ${containerClasses}"
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
