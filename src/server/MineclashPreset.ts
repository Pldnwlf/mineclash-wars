import {
  GameMode,
  HumansVsNations,
} from "@openfront/engine-api/game/GameTypes";
import {
  type GameConfig,
  MINECLASH_END_MINUTES,
} from "@openfront/engine-api/Schemas";

// mineclash #9: rules for ALL rotation lobbies (stake AND free):
// - win-rule preset on (humans only, 80% -> 70% from min 15, end min 25,
//   ties share; also switches team assignment to random)
// - donations off, nations + bots on
// - Humans vs Nations never in rotation (only free custom lobbies)
export function applyMineclashRotationPreset(config: GameConfig): GameConfig {
  return {
    ...config,
    mineclashRules: { endMinutes: MINECLASH_END_MINUTES },
    donateGold: false,
    donateTroops: false,
    nations: "default",
    overtime: undefined, // replaced by mineclashRules
    maxTimerValue: undefined,
    playerTeams:
      config.gameMode === GameMode.Team &&
      config.playerTeams === HumansVsNations
        ? 2
        : config.playerTeams,
  };
}
