import {
  ColoredTeams,
  GameMode,
  PlayerType,
  Team,
} from "@openfront/engine-api/game/GameTypes";
import {
  mineclashBar,
  mineclashEndMinutes,
  mineclashThreshold,
} from "@openfront/engine-api/Schemas";
import type { Game, Player } from "../game/Game";

// mineclash #9: win rules for stake/rotation matches (GameConfig.mineclashRules).
// - Only humans can win. A bot/nation reaching the bar ends the game with
//   "no human winner" (["none"], stakes refunded), as does the last human dying.
// - Last human (team) with land wins at once. Disconnect is NOT elimination:
//   a disconnected human keeps land and stays in the game until wiped out.
// - Only humans who spawned count. Stake match with < 2 spawned humans after
//   the spawn phase ends with "no human winner" (the server refunds all).
// - 80% of land; from minute 15 the bar drops 1 point per minute; at the end
//   minute (25 => 70%) the human with the most land wins; ties share.
// Integer math on whole game seconds (ticks / 10), deterministic.
export { mineclashThreshold };

type Side = string | Player; // team name (team modes) or player (FFA)

// Returns true once the game is decided (result set on mg).
export function checkMineclashWin(mg: Game): boolean {
  const cfg = mg.config().gameConfig();
  const isTeams = cfg.gameMode !== GameMode.FFA;
  const alive = mg.players();
  const aliveHumans = alive.filter((p) => p.type() === PlayerType.Human);
  const everHumans = mg
    .allPlayers()
    .filter((p) => p.type() === PlayerType.Human && p.hasSpawned());
  const stats = () => mg.stats().stats();

  if (aliveHumans.length === 0) {
    mg.setNoHumanWinner(stats());
    return true;
  }

  const sideOf = (p: Player): Side => (isTeams ? (p.team() as Team) : p);
  const tiles = new Map<Side, number>();
  for (const p of alive) {
    if (isTeams && (p.team() === null || p.team() === ColoredTeams.Bot)) {
      continue;
    }
    tiles.set(sideOf(p), (tiles.get(sideOf(p)) ?? 0) + p.numTilesOwned());
  }
  const hasAliveHuman = (side: Side) =>
    aliveHumans.some((h) => sideOf(h) === side);
  const win = (sides: Side[]) => {
    const humans = everHumans.filter((h) => sides.includes(sideOf(h)));
    const team = isTeams && sides.length === 1 ? (sides[0] as Team) : null;
    mg.setHumanWinners(humans, team, stats());
    return true;
  };

  // Last human side standing (only if >1 human side started).
  const startedSides = new Set(everHumans.map(sideOf));
  if (cfg.mineclashStake !== undefined && startedSides.size < 2) {
    mg.setNoHumanWinner(stats());
    return true;
  }
  const aliveSides = new Set(aliveHumans.map(sideOf));
  if (startedSides.size >= 2 && aliveSides.size === 1) {
    return win([...aliveSides]);
  }

  const rules = cfg.mineclashRules ?? {};
  const elapsed = mg.elapsedGameSeconds();
  const land = mg.numLandTiles() - mg.numTilesWithFallout();
  const sorted = [...tiles.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0) {
    const [topSide, topTiles] = sorted[0];
    if (topTiles * 100 > land * mineclashBar(rules, elapsed)) {
      if (hasAliveHuman(topSide)) return win([topSide]);
      mg.setNoHumanWinner(stats());
      return true;
    }
  }

  // Time end: the host's timer (if shorter) or the preset's end minute.
  const endMinutes = mineclashEndMinutes(cfg);
  if (endMinutes !== undefined && elapsed >= endMinutes * 60) {
    // FFA: bots/nations don't count. Teams: the leading team counts as a
    // whole, so a nation-only team (humans vs nations) in front means none.
    const pool = isTeams ? sorted : sorted.filter(([s]) => hasAliveHuman(s));
    const best = pool.length > 0 ? pool[0][1] : 0;
    const humanSides = pool.filter(([s, t]) => t === best && hasAliveHuman(s));
    if (humanSides.length === 0) {
      mg.setNoHumanWinner(stats());
      return true;
    }
    return win(humanSides.map(([s]) => s));
  }
  return false;
}
