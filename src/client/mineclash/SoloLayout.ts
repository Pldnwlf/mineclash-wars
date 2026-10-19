// mineclash #45: solo modal in the FrontWars layout. Left: tabs "Map" /
// "Rules & options" over the shared <game-config-settings> (the tab only hides
// sections via CSS, see hud.css); right: summary + start button.
import {
  Difficulty,
  GameMapType,
  GameMode,
} from "@openfront/engine-api/game/GameTypes";
import { html, TemplateResult } from "lit";
import { terrainMapFileLoader } from "../TerrainMapFileLoader";
import { getMapName, translateText } from "../Utils";

export type SoloTab = "map" | "rules";

export type SoloSummary = {
  map: GameMapType;
  random: boolean;
  gameMode: GameMode;
  difficulty: Difficulty;
  bots: number;
  nations: number;
  /** Translation keys of the enabled modifiers. */
  modifiers: string[];
};

const TAB =
  "flex-1 rounded-xl py-2.5 text-base font-bold transition-colors cursor-pointer";

function tile(label: string, value: unknown) {
  return html`<div class="rounded-xl border border-white/10 bg-white/5 p-3">
    <div class="text-[11px] font-bold uppercase tracking-wider text-white/50">
      ${label}
    </div>
    <div class="mt-0.5 font-semibold text-white">${value}</div>
  </div>`;
}

function summary(s: SoloSummary) {
  const mapName = s.random
    ? translateText("map.random")
    : (getMapName(s.map) ?? s.map);
  return html`<div class="flex flex-col gap-2.5">
    <div
      class="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
    >
      ${s.random
        ? null
        : html`<img
            src=${terrainMapFileLoader.getMapData(s.map).webpPath}
            alt=""
            class="size-12 rounded-md object-cover"
          />`}
      <div>
        <div
          class="text-[11px] font-bold uppercase tracking-wider text-white/50"
        >
          ${translateText("mineclash.solo_map")}
        </div>
        <div class="font-semibold text-white">${mapName}</div>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-2.5">
      ${tile(
        translateText("mineclash.solo_mode"),
        translateText(
          s.gameMode === GameMode.Team ? "game_mode.teams" : "game_mode.ffa",
        ),
      )}
      ${tile(
        translateText("mineclash.solo_difficulty"),
        translateText(`difficulty.${s.difficulty.toLowerCase()}`),
      )}
      ${tile(translateText("mineclash.solo_bots"), s.bots)}
      ${tile(translateText("mineclash.solo_nations"), s.nations)}
    </div>
    ${tile(
      translateText("mineclash.solo_modifiers"),
      s.modifiers.length === 0
        ? "–"
        : s.modifiers.map((k) => translateText(k)).join(", "),
    )}
  </div>`;
}

export function renderSoloLayout(o: {
  tab: SoloTab;
  onTab: (t: SoloTab) => void;
  config: TemplateResult;
  summary: SoloSummary;
  starting: boolean;
  onStart: () => void;
}) {
  const tabBtn = (t: SoloTab, key: string) =>
    html`<button
      class="${TAB} ${o.tab === t
        ? "bg-mc text-mc-on"
        : "bg-white/5 text-white/70 hover:bg-white/10"}"
      @click=${() => o.onTab(t)}
    >
      ${translateText(key)}
    </button>`;
  return html`<div
    class="grid h-full min-h-0 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:p-6"
  >
    <div class="flex min-h-0 flex-col gap-3">
      <div class="flex gap-2">
        ${tabBtn("map", "mineclash.solo_map")}
        ${tabBtn("rules", "mineclash.solo_tab_rules")}
      </div>
      <div
        class="mc-solo-${o.tab} min-h-0 flex-1 overflow-y-auto custom-scrollbar rounded-xl border border-white/10 bg-black/20 p-4"
      >
        ${o.config}
      </div>
    </div>
    <div class="flex min-h-0 flex-col justify-between gap-4">
      <div class="hidden lg:block">${summary(o.summary)}</div>
      <button
        class="flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-b from-mc to-mc-2 py-4 text-lg font-bold text-mc-on shadow-[0_8px_22px_rgba(240,192,48,0.35)] transition hover:brightness-110 disabled:opacity-60"
        ?disabled=${o.starting}
        @click=${o.onStart}
      >
        <svg viewBox="0 0 24 24" class="size-5 fill-current" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
        ${translateText(
          o.starting ? "game_settings.starting" : "game_settings.start",
        )}
      </button>
    </div>
  </div>`;
}
