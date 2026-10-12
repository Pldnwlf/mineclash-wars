// mineclash #15: pure helpers for radial menu labels

// cooldown in seconds (0 = ready), from an absolute ready tick (10 ticks/s)
export function cooldownSeconds(
  readyTick: number | undefined,
  nowTick: number,
): number {
  return Math.max(0, (readyTick ?? 0) - nowTick) / 10;
}

export function boatCounter(used: number, max: number): string {
  return `${used}/${max}`;
}
