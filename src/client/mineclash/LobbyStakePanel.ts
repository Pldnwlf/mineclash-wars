import { GameConfig } from "@openfront/engine-api/Schemas";
import { html, TemplateResult } from "lit";
import { translateText } from "../Utils";
import { formatUsd } from "./menu/MenuLogic";

// mineclash #20/#23: stake area of the lobby view. Without a stake (free
// lobby) nothing is shown.
export interface LobbyStakeInfo {
  stakePerPlayer: number; // Coins
  pot: number; // Coins, stake * humans
  rake: number; // Coins, 5 % rounded up (the rounding remainder burns too)
  donations: boolean;
  moneyValue?: string; // already formatted real-money value of the stake
}

/** Stake of this lobby from its config; null = free lobby. */
export function lobbyStakeInfo(
  config: GameConfig,
  humanCount: number,
  wdPerCoin: number | null,
): LobbyStakeInfo | null {
  const coins = config.mineclashStake?.coins;
  if (coins === undefined) return null;
  const pot = coins * humanCount;
  return {
    stakePerPlayer: coins,
    pot,
    rake: pot - Math.floor((pot * 95) / 100),
    donations: config.donateGold === true,
    moneyValue: formatUsd(coins, wdPerCoin) || undefined,
  };
}

export function renderLobbyStake(stake: LobbyStakeInfo | null): TemplateResult {
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
      ${cell(translateText("mineclash.lobby_pot"), `${coins(stake.pot)} Coins`)}
      ${cell(
        translateText("mineclash.lobby_rake"),
        `${coins(stake.rake)} Coins (5 %)`,
      )}
      ${cell(
        translateText("host_modal.donate_gold"),
        translateText(stake.donations ? "common.enabled" : "common.disabled"),
      )}
    </div>
    <div class="mt-2 text-xs text-white/60">
      ${translateText("mineclash.lobby_payout_rule")}
    </div>
  </div>`;
}
