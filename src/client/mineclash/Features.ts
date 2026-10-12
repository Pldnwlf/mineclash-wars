// mineclash #5: central switches for OpenFront features we do not run.
//
// Upstream-friendly: files stay in place, only the entry points are switched
// off (element not in index.html, route not registered, script tag removed,
// or a one-line guard on these flags). Re-enable by restoring the entry point.
//
// Off via index.html / Main.ts / nav bars / PlayPage / Footer / GameModeSelector
// (nothing rendered or registered, so no buttons, no requests):
//   Store, Inventory, Subscription/Plutonium, Rewards, Purchase nudge,
//   Ranked + Matchmaking UI, Clans, Leaderboard, Steam wishlist/link/handoff,
//   desktop status bar, FeaturedStream + StreamingNow (Twitch/YouTube),
//   HomepagePromos, ads (Admiral, AdGatekeeper, Ramp/GPT, window.adsEnabled=false),
//   googletagmanager, Cloudflare Insights, CrazyGames SDK script, Turnstile
//   (widget + script; server side see planJoinVerify in src/server/JoinVerify.ts).
//
// Off via the flags below (a guard at the API chokepoint;
// they stay on under vitest, because upstream tests cover the dormant code):
const test = import.meta.env?.MODE === "test";

export const Features = {
  /** OpenFront login (Discord/Google/Steam/email, /auth/refresh). #21: mineclash login instead. */
  openfrontAuth: test,
  /** /cosmetics.json from the closed OpenFront API (store, skins, flares). */
  cosmetics: test,
  /** XP / levels / prestige (/progression/* + win-modal XP panel). */
  progression: test,
  /** News fetched from the API; false = bundled fallback only. */
  remoteNews: test,
  /** Win-modal promo box (Steam wishlist, Discord, pattern shop, YouTube). */
  winPromos: test,
  /** Lazy modals that are not in index.html, so they must not be prefetched. */
  disabledModals: [
    "clan-modal",
    "inventory-modal",
    "leaderboard-modal",
    "matchmaking-modal",
    "ranked-modal",
    "rewards-modal",
    "steam-handoff-modal",
    "steam-link-modal",
    "store-modal",
    "subscription-modal",
  ] as readonly string[],
};
