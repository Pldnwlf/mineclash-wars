import { GameConfig } from "@openfront/engine-api/Schemas";
import { html, TemplateResult } from "lit";
import { translateText } from "../Utils";

// mineclash #20: stake area of the lobby view. The data comes through this
// interface; without a stake (free lobby) nothing is shown.
export interface LobbyStakeInfo {
  stakePerPlayer: number; // Coins
  moneyValue?: string; // already formatted real-money value of the stake
}

// mineclash #23 hook: return the stake of this lobby here once the stake
// lobbies exist (config / lobby_info). Free lobbies and today: null.
export function lobbyStakeInfo(_config: GameConfig): LobbyStakeInfo | null {
  return null;
}

export function renderLobbyStake(
  stake: LobbyStakeInfo | null,
  humanCount: number,
  donationsAllowed: boolean,
): TemplateResult {
  if (stake === null) return html``;
  const coins = (n: number) => n.toLocaleString();
  const cell = (label: string, value: string) =>
    html`<div>
      <div
        class="text-[10px] font-bold uppercase tracking-widest text-white/40"
      >
        ${label}
      </div>
      <div class="text-sm font-bold text-white">${value}</div>
    </div>`;
  return html`<div
    data-test-lobby-stake
    class="mt-4 mb-6 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg"
  >
    <div
      class="text-xs font-bold text-amber-400 uppercase tracking-widest mb-2"
    >
      ${translateText("mineclash.lobby_stake_title")}
    </div>
    <div class="flex flex-wrap gap-x-8 gap-y-2">
      ${cell(
        translateText("mineclash.lobby_stake_per_player"),
        `${coins(stake.stakePerPlayer)} Coins${stake.moneyValue ? ` (${stake.moneyValue})` : ""}`,
      )}
      ${cell(
        translateText("mineclash.lobby_pot"),
        `${coins(stake.stakePerPlayer * humanCount)} Coins`,
      )}
      ${cell(
        translateText("host_modal.donate_gold"),
        translateText(donationsAllowed ? "common.enabled" : "common.disabled"),
      )}
    </div>
    <div class="mt-2 text-xs text-white/60">
      ${translateText("mineclash.lobby_payout_rule")}
    </div>
  </div>`;
}
