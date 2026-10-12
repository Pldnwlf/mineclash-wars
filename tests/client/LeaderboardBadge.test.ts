import { leaderboardBadgeText } from "../../src/client/mineclash/LeaderboardBadge";

describe("leaderboardBadgeText", () => {
  it("shows the economy mode via translation key", () => {
    expect(leaderboardBadgeText()).toBe("leaderboard.badge_economy_classic");
  });
});
