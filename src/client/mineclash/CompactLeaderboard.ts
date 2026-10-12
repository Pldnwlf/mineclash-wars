// mineclash: compact leaderboard in FrontWars style (replaces the upstream
// player-stats table in the left sidebar): top 5, own row pinned at the
// bottom, "+" expands, sortable by Owned / Gold / Troops. No grid, no picker.
import { renderNumber, renderTroops } from "@openfront/engine-lib/Format";
import type { EventBus } from "@openfront/shared/EventBus";
import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { GoToPlayerEvent } from "../TransformHandler";
import { formatPercentage, translateText } from "../Utils";
import type { GameView, PlayerView } from "../view";

export type SortKey = "tiles" | "gold" | "troops";

export interface BoardRow {
  rank: number;
  player: PlayerView;
  tiles: number;
  gold: number;
  troops: number;
  mine: boolean;
}

export const COLLAPSED_ROWS = 5;

// Ranked rows (alive players, best first) plus the own row when it is not
// already among the shown ones.
export function buildBoard(
  game: GameView,
  sort: SortKey,
  expanded: boolean,
): { shown: BoardRow[]; pinned: BoardRow | null; total: number } {
  const me = game.myPlayer();
  const rows = game
    .playerViews()
    .filter((p) => p.isAlive())
    .map((p) => ({
      player: p,
      tiles: p.numTilesOwned(),
      gold: Number(p.gold()),
      troops: p.troops(),
      mine: me !== null && p === me,
    }))
    .sort((a, b) => b[sort] - a[sort] || b.tiles - a.tiles)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  const shown = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);
  const own = rows.find((r) => r.mine) ?? null;
  return {
    shown,
    pinned: own !== null && !shown.includes(own) ? own : null,
    total: rows.length,
  };
}

@customElement("mineclash-leaderboard")
export class CompactLeaderboard extends LitElement {
  @property({ attribute: false }) game: GameView | null = null;
  @property({ attribute: false }) eventBus: EventBus | null = null;
  @property({ type: Boolean }) visible = false;
  @state() private sort: SortKey = "tiles";
  @state() private expanded = false;

  createRenderRoot() {
    return this;
  }

  refresh() {
    if (this.visible) this.requestUpdate();
  }

  private header(key: SortKey | null, label: string) {
    const active = key !== null && key === this.sort;
    return html`<th
      class="px-2 py-1.5 text-left font-medium ${key
        ? "cursor-pointer hover:text-white"
        : ""} ${active ? "text-white" : ""}"
      @click=${() => key && (this.sort = key)}
    >
      ${label}${active ? "↓" : ""}
    </th>`;
  }

  private row(r: BoardRow, valid: number, pinned = false) {
    return html`<tr
      class="cursor-pointer hover:bg-white/5 ${r.mine
        ? "font-bold"
        : ""} ${pinned ? "bg-black/40" : ""}"
      @click=${() => this.eventBus?.emit(new GoToPlayerEvent(r.player))}
    >
      <td class="px-2 py-1 tabular-nums">${r.rank}</td>
      <td class="max-w-[9rem] truncate px-2 py-1">${r.player.name()}</td>
      <td class="px-2 py-1 tabular-nums">
        ${formatPercentage(valid > 0 ? r.tiles / valid : 0)}
      </td>
      <td class="px-2 py-1 tabular-nums">${renderNumber(r.gold)}</td>
      <td class="px-2 py-1 tabular-nums">${renderTroops(r.troops)}</td>
    </tr>`;
  }

  render() {
    const game = this.game;
    if (!this.visible || game === null) return html``;
    const valid = game.numLandTiles() - game.numTilesWithFallout();
    const { shown, pinned, total } = buildBoard(game, this.sort, this.expanded);
    return html`
      <div class="${this.expanded ? "max-h-[50vh] overflow-y-auto" : ""}">
        <table class="w-full border-collapse text-sm text-white">
          <thead class="bg-black/40 text-xs text-slate-400">
            <tr>
              ${this.header(null, "#")}
              ${this.header(null, translateText("leaderboard.player"))}
              ${this.header("tiles", translateText("leaderboard.owned"))}
              ${this.header("gold", translateText("leaderboard.gold"))}
              ${this.header("troops", translateText("leaderboard.troops"))}
            </tr>
          </thead>
          <tbody>
            ${shown.map((r) => this.row(r, valid))}
            ${pinned ? this.row(pinned, valid, true) : null}
          </tbody>
        </table>
      </div>
      ${total > COLLAPSED_ROWS
        ? html`<button
            class="w-full py-1 text-lg leading-none text-white/80 hover:text-white"
            @click=${() => (this.expanded = !this.expanded)}
            aria-label=${this.expanded
              ? translateText("mineclash.leaderboard_less")
              : translateText("mineclash.leaderboard_more")}
          >
            ${this.expanded ? "−" : "+"}
          </button>`
        : null}
    `;
  }
}
