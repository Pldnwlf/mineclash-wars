// mineclash #12: player info card in the FrontWars layout (labelled rows).
// Layout after FrontWars' graphics/layers/PlayerInfoOverlay.ts (GPL v3, see
// CREDITS.md). Used by hud/layers/PlayerInfoOverlay.ts, which keeps the
// hover logic and the action buttons.
import {
  PlayerProfile,
  PlayerType,
  Relation,
  UnitType,
} from "@openfront/engine-api/game/GameTypes";
import { renderNumber, renderTroops } from "@openfront/engine-lib/Format";
import { assetUrl } from "@openfront/shared/AssetUrls";
import { html, TemplateResult } from "lit";
import {
  EMOJI_ICON_KIND,
  getFirstPlacePlayer,
  getPlayerIcons,
  IMAGE_ICON_KIND,
} from "../hud/PlayerIcons";
import { renderDuration, translateText } from "../Utils";
import { GameView, PlayerView } from "../view";

const allianceIcon = assetUrl("images/AllianceIcon.svg");
const traitorIcon = assetUrl("images/TraitorIcon.svg");

function relationText(
  player: PlayerView,
  myPlayer: PlayerView | null | undefined,
  profile: PlayerProfile | null,
): string {
  if (myPlayer?.isAlliedWith(player)) {
    return translateText("player_info_overlay.allied");
  }
  if (!myPlayer || myPlayer === player || player.type() !== PlayerType.Nation) {
    return translateText("relation.neutral");
  }
  switch (profile?.relations[myPlayer.smallID()] ?? Relation.Neutral) {
    case Relation.Hostile:
      return translateText("relation.hostile");
    case Relation.Distrustful:
      return translateText("relation.distrustful");
    case Relation.Friendly:
      return translateText("relation.friendly");
    case Relation.Neutral:
      return translateText("relation.neutral");
    default:
      return translateText("relation.default");
  }
}

function row(label: string, value: unknown, valueClass = "text-white") {
  return html`<div class="flex justify-between gap-2" translate="no">
    <span class="text-white/80">${label}:</span>
    <span class="font-bold tabular-nums ${valueClass}">${value}</span>
  </div>`;
}

/** `footer`: the action/shortcut buttons of the overlay (may be empty). */
export function renderPlayerInfoCard(
  game: GameView,
  player: PlayerView,
  profile: PlayerProfile | null,
  footer: TemplateResult | string,
) {
  const myPlayer = game.myPlayer();
  const unitRow = (type: UnitType, key: string) =>
    game.config().isUnitDisabled(type)
      ? ""
      : row(
          translateText(`player_info_overlay.${key}`),
          player.totalUnitLevels(type),
        );
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
    game,
    player,
    firstPlace: getFirstPlacePlayer(game),
  });
  const traitorTicks = player.getTraitorRemainingTicks();
  const alliance = myPlayer?.isAlliedWith(player)
    ? myPlayer.alliances().find((a) => a.other === player.id())
    : undefined;

  return html`
    <div class="px-3 py-2 space-y-1 text-sm">
      <div
        class="flex items-center gap-1.5 font-bold text-base break-all ${myPlayer?.isFriendly(
          player,
        )
          ? "text-green-500"
          : "text-white"}"
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
                      Math.floor((alliance.expiresAt - game.ticks()) / 10),
                    ),
                  )}</span
                >`
              : ""}
          </div>`
        : ""}
      ${row(
        translateText("player_info_overlay.type"),
        translateText(`player_type.${typeKey}`),
      )}
      ${row(
        translateText("player_info_overlay.relation"),
        relationText(player, myPlayer, profile),
      )}
      ${row(
        translateText("player_info_overlay.troops"),
        renderTroops(player.troops()),
      )}
      ${row(
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
      ${unitRow(UnitType.City, "cities")}
      ${unitRow(UnitType.Factory, "factories")}
      ${unitRow(UnitType.Port, "ports")}
      ${unitRow(UnitType.MissileSilo, "silos")}
      ${unitRow(UnitType.SAMLauncher, "sams")}
      ${unitRow(UnitType.Warship, "warships")} ${footer}
    </div>
  `;
}
