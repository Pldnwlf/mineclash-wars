import type { GameConfig } from "@openfront/engine-api/Schemas";
import { mineclashThreshold } from "@openfront/engine/execution/MineclashWinCheck";
import { translateText } from "../Utils";

// mineclash #9: stake matches have no host timer (maxTimerValue undefined), but
// end at mineclashRules.endMinutes (or the shorter host timer) - same rule as
// the engine's win check.
export function endTimerMinutes(cfg: GameConfig): number | undefined {
  if (!cfg.mineclashRules) return cfg.maxTimerValue ?? undefined;
  return Math.min(cfg.mineclashRules.endMinutes, cfg.maxTimerValue ?? Infinity);
}

// "Win: 80 %" / "Win: 77 % · Overtime"; undefined outside mineclash matches.
export function thresholdText(
  cfg: GameConfig,
  elapsedSeconds: number,
): string | undefined {
  if (!cfg.mineclashRules) return undefined;
  const percent = mineclashThreshold(elapsedSeconds);
  return translateText(
    percent < 80 ? "mineclash.threshold_overtime" : "mineclash.threshold",
    { percent },
  );
}
