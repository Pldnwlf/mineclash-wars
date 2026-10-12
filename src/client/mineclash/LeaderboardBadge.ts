import { translateText } from "../Utils";

// mineclash #14: badge above the leaderboard. Economy mode only for now;
// #23 extends this with stake/pot text for stake matches.
export function leaderboardBadgeText(): string {
  return translateText("leaderboard.badge_economy_classic");
}
