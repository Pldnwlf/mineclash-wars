import { GameMapType } from "../core/game/Game";

// mineclash rotation pool (#9): replaces OpenFront's per-map frequencies in
// scheduled public games. Few players at launch ⇒ mostly small maps (the 20
// most played OpenFront maps with max ≤ 45 players), plus a few ~50-player maps
// with half the weight. Custom lobbies can still pick any map.
// Max players = land tiles / 1M × 50 (MapPlaylist.calculateMapPlayerCounts).
export const MINECLASH_ROTATION: ReadonlyMap<GameMapType, number> = new Map([
  // small, max players in brackets
  [GameMapType.World, 2], // 35
  [GameMapType.Sierpinski, 2], // 30
  [GameMapType.MilkyWay, 2], // 20
  [GameMapType.MoreThanLuck, 2], // 45
  [GameMapType.Japan, 2], // 25
  [GameMapType.Italia, 2], // 40
  [GameMapType.Venice, 2], // 40
  [GameMapType.Pangaea, 2], // 20
  [GameMapType.Caribbean, 2], // 30
  [GameMapType.DanishStraits, 2], // 30
  [GameMapType.Caucasus, 2], // 40
  [GameMapType.Korea, 2], // 40
  [GameMapType.NewZealand, 2], // 40
  [GameMapType.TierraDelFuego, 2], // 40
  [GameMapType.EastAsia, 2], // 45
  [GameMapType.TaiwanStrait, 2], // 45
  [GameMapType.FaroeIslands, 2], // 20
  [GameMapType.Hawaii, 2], // 20
  [GameMapType.FourIslands, 2], // 25
  [GameMapType.CapeCod, 2], // 30
  // ~50 players
  [GameMapType.Svalmel, 1], // 50
  [GameMapType.Baltics, 1], // 50
  [GameMapType.SoutheastAsia, 1], // 50
  [GameMapType.Asia, 1], // 55
]);
