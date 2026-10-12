import { translateText } from "../Utils";

// mineclash #14/#23: badge above the leaderboard. Economy mode; stake matches
// show the pot instead (stake per player x humans in the match).
export function leaderboardBadgeText(stakeCoins?: number, humans = 0): string {
  if (stakeCoins === undefined) {
    return translateText("leaderboard.badge_economy_classic");
  }
  return translateText("mineclash.badge_pot", {
    coins: (stakeCoins * humans).toLocaleString(),
  });
}
