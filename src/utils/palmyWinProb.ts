import winProb from '../data/palmyWinProb.json'

// PalmyScore win-probability calibration. Index = absolute predicted margin in
// points; value = historical probability the predicted favourite actually won.
// Two variants match the two predicted-score variants: 'all' (all-games ratings)
// and 'ha' (home/away venue-adjusted ratings). Built from past matches — see
// local-db/scripts/export-win-prob.js.
export type PalmyVariant = 'all' | 'ha'

export const PALMY_MAX = winProb.maxMargin as number

function table(variant: PalmyVariant): number[] {
  return (variant === 'ha' ? winProb.ha : winProb.all) as number[]
}

// Probability the HOME team wins given a PalmyScore predicted scoreline.
export function homeWinProbFromScore(
  predHome: number,
  predAway: number,
  variant: PalmyVariant = 'ha',
): number {
  const margin = predHome - predAway
  const favProb = table(variant)[Math.min(Math.abs(Math.round(margin)), PALMY_MAX)] ?? 0.5
  return margin >= 0 ? favProb : 1 - favProb
}

// Probability the predicted favourite (higher predicted score) wins.
export function favouriteWinProb(
  predHome: number,
  predAway: number,
  variant: PalmyVariant = 'ha',
): number {
  const home = homeWinProbFromScore(predHome, predAway, variant)
  return Math.max(home, 1 - home)
}
