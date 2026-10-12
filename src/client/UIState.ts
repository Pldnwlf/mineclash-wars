import { PlayerBuildableUnitType } from "@openfront/engine-api/game/GameTypes";

export interface UIState {
  attackRatio: number;
  // Share of troops / gold a quick donation to an ally sends (0..1).
  donateTroopRatio: number;
  donateGoldRatio: number;
  ghostStructure: PlayerBuildableUnitType | null;
  rocketDirectionUp: boolean;
  upgradeMultiplier: number;
}
