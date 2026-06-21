import winProb from '../data/palmyWinProb.json'

// PalmyScore win-probability calibration. The JSON holds, per variant, the raw
// historical favourite win rate at each 1-point predicted margin plus the sample
// size. Calculations use the TREND of those points (a sample-weighted linear fit)
// rather than the noisy raw values, so a predicted margin maps to a smooth,
// monotonic win probability. Two variants match the two predicted-score modes:
// 'all' (all-games ratings) and 'ha' (home/away venue-adjusted ratings).
export type PalmyVariant = 'all' | 'ha'

export const PALMY_MAX = winProb.maxMargin as number

export interface PalmyTrend {
  slope: number // change in favourite win probability per predicted point
  intercept: number // favourite win probability at a 0-point margin
}

// Weighted least-squares fit of favourite win rate vs predicted margin, weighting
// each point by its sample count so noisy small-sample margins don't dominate.
function fit(arr: number[], games: number[]): PalmyTrend {
  let W = 0, sx = 0, sy = 0
  const pts: [number, number, number][] = []
  for (let m = 0; m <= PALMY_MAX; m++) {
    const g = games[m] ?? 0
    if (g <= 0) continue
    pts.push([m, arr[m], g]); W += g; sx += g * m; sy += g * arr[m]
  }
  if (W === 0) return { slope: 0, intercept: 0.5 }
  const mx = sx / W, my = sy / W
  let cov = 0, vx = 0
  for (const [x, y, g] of pts) { cov += g * (x - mx) * (y - my); vx += g * (x - mx) ** 2 }
  const slope = vx === 0 ? 0 : cov / vx
  return { slope, intercept: my - slope * mx }
}

export const palmyTrends: Record<PalmyVariant, PalmyTrend> = {
  ha: fit(winProb.ha as number[], (winProb._gamesHa ?? []) as number[]),
  all: fit(winProb.all as number[], (winProb._gamesAll ?? []) as number[]),
}

function table(variant: PalmyVariant): number[] {
  return (variant === 'ha' ? winProb.ha : winProb.all) as number[]
}

// Favourite (higher predicted score) win probability for an absolute margin:
// the per-point historical rate, recalculated for each point, with no clamping.
// Margins beyond the curve reuse the last point.
export function favouriteWinProbAtMargin(absMargin: number, variant: PalmyVariant = 'ha'): number {
  return table(variant)[Math.min(Math.abs(Math.round(absMargin)), PALMY_MAX)] ?? 0.5
}

// Probability the HOME team wins given a PalmyScore predicted scoreline.
export function homeWinProbFromScore(
  predHome: number,
  predAway: number,
  variant: PalmyVariant = 'ha',
): number {
  const margin = predHome - predAway
  const favProb = favouriteWinProbAtMargin(margin, variant)
  return margin >= 0 ? favProb : 1 - favProb
}

// Win probability of the predicted favourite (higher predicted score).
export function favouriteWinProb(
  predHome: number,
  predAway: number,
  variant: PalmyVariant = 'ha',
): number {
  return favouriteWinProbAtMargin(predHome - predAway, variant)
}
