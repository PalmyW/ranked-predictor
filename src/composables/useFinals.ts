import type { AflMatch, FinalsBracketMatch, FinalsColumn, FinalsSlot, FinalsSlotRule, LadderRow } from '../types/afl'
import { teamById } from './useAFLData'
import { matchHomeWinProb, sampleMatchScores, SIM_WIN_SCORE, SIM_LOSS_SCORE, type MatchScorePrediction } from './useSimulation'
import type { PalmyVariant } from '../utils/palmyWinProb'

// Every finals-round abbreviation seen across seasons: the 2026+ wildcard
// format (WF/QE/SF/PF/GF) and the pre-2026 top-8 format (FW1/SF/PF/GF).
export const FINALS_ROUND_ABBREVIATIONS = new Set(['WF', 'QE', 'QF', 'EF', 'FW1', 'SF', 'PF', 'GF'])

// Bracket column display order — unknown/absent codes are simply skipped.
const COLUMN_ORDER = ['WF', 'QE', 'QF', 'EF', 'FW1', 'SF', 'PF', 'GF']

export function isFinalsMatch(match: AflMatch): boolean {
  return FINALS_ROUND_ABBREVIATIONS.has(match.roundAbbreviation)
}

// Turns a match's finals label ("Qualifying Final 1", "Elimination Final 2",
// "2026 Toyota AFL Grand Final") into a short code ("QF1", "EF2", "GF") that
// other slots reference via "Winner of QF1" / "Loser of QF1" style names.
function deriveSourceCode(match: AflMatch): string {
  const label = match.finalsMatchLabel ?? match.roundName
  const patterns: Array<[RegExp, string]> = [
    [/wildcard final/i, 'WF'],
    [/qualifying final/i, 'QF'],
    [/elimination final/i, 'EF'],
    [/semi.?final/i, 'SF'],
    [/preliminary final/i, 'PF'],
    [/grand final/i, 'GF'],
  ]
  for (const [re, code] of patterns) {
    if (!re.test(label)) continue
    if (code === 'GF') return 'GF'
    const num = label.match(/(\d+)\s*$/)
    return num ? `${code}${num[1]}` : code
  }
  return `${match.roundAbbreviation}-${match.id}`
}

function parseSlotRule(rawName: string): FinalsSlotRule {
  const seed = rawName.match(/^(\d{1,2})(st|nd|rd|th)$/i)
  if (seed) return { kind: 'seed', position: Number(seed[1]) }

  const result = rawName.match(/^(Winner|Loser) of ([A-Za-z]+\d+)$/i)
  if (result) return { kind: 'result', result: result[1].toLowerCase() as 'winner' | 'loser', sourceCode: result[2].toUpperCase() }

  const ranked = rawName.match(/^(Lowest|Highest)-ranked ([A-Za-z]+) Winner$/i)
  if (ranked) return { kind: 'rankedWinner', rank: ranked[1].toLowerCase() as 'lowest' | 'highest', roundCode: ranked[2].toUpperCase() }

  return { kind: 'resolved' }
}

function seedOf(teamId: number, ladder: readonly LadderRow[]): number | null {
  const i = ladder.findIndex((r) => r.teamId === teamId)
  return i === -1 ? null : i + 1
}

// Resolves the real AFL finals bracket (Wildcard -> Qualifying/Elimination ->
// Semi -> Preliminary -> Grand Final) from the fixture's own placeholder
// team-name strings, seeding unresolved slots off `ladder` and simulating
// (or reading real results for) each match as its two teams become known.
export function buildFinalsBracket(
  matches: readonly AflMatch[],
  ladder: readonly LadderRow[],
  rankMap: Record<number, number>,
  predMap: Map<number, MatchScorePrediction> | null,
  usePalmy: boolean,
  variant: PalmyVariant,
  random: boolean,
): FinalsBracketMatch[] {
  const finalsMatches = matches.filter(isFinalsMatch)
  if (finalsMatches.length === 0 || ladder.length === 0) return []

  const rawById = new Map(finalsMatches.map((m) => [m.id, m]))

  const results: FinalsBracketMatch[] = finalsMatches.map((match) => {
    const sourceCode = deriveSourceCode(match)
    const makeSlot = (teamId: number, name: string): FinalsSlot =>
      teamById(teamId)
        ? { teamId, seed: seedOf(teamId, ladder), placeholderLabel: name, rule: { kind: 'resolved' } }
        : { teamId: null, seed: null, placeholderLabel: name, rule: parseSlotRule(name) }
    return {
      matchId: match.id,
      sourceCode,
      roundAbbreviation: match.roundAbbreviation,
      roundName: match.roundName,
      finalsMatchLabel: match.finalsMatchLabel ?? match.roundName,
      venueName: match.venueName,
      utcStartTime: match.utcStartTime,
      status: match.status,
      home: makeSlot(match.homeTeamId, match.homeTeamName),
      away: makeSlot(match.awayTeamId, match.awayTeamName),
      winnerTeamId: null,
      homeScore: null,
      awayScore: null,
      isSimulated: false,
    }
  })

  const outcomes = new Map<string, { winnerId: number; loserId: number }>()
  const allCodes = results.map((r) => r.sourceCode)

  const resolveSlot = (slot: FinalsSlot): number | null => {
    const rule = slot.rule
    if (rule.kind === 'seed') return ladder[rule.position - 1]?.teamId ?? null
    if (rule.kind === 'result') {
      const o = outcomes.get(rule.sourceCode)
      if (!o) return null
      return rule.result === 'winner' ? o.winnerId : o.loserId
    }
    if (rule.kind === 'rankedWinner') {
      const codes = allCodes.filter((c) => c.replace(/\d+$/, '') === rule.roundCode)
      if (codes.length === 0 || !codes.every((c) => outcomes.has(c))) return null
      const winners = codes.map((c) => outcomes.get(c)!.winnerId)
      const seeds = winners.map((id) => ({ id, seed: seedOf(id, ladder) ?? 999 }))
      seeds.sort((a, b) => a.seed - b.seed)
      return rule.rank === 'highest' ? seeds[0].id : seeds[seeds.length - 1].id
    }
    return null
  }

  let changed = true
  let guard = 0
  while (changed && guard++ <= finalsMatches.length) {
    changed = false
    for (const fm of results) {
      if (fm.winnerTeamId !== null) continue
      if (fm.home.teamId === null) {
        const id = resolveSlot(fm.home)
        if (id !== null) { fm.home.teamId = id; fm.home.seed = seedOf(id, ladder); changed = true }
      }
      if (fm.away.teamId === null) {
        const id = resolveSlot(fm.away)
        if (id !== null) { fm.away.teamId = id; fm.away.seed = seedOf(id, ladder); changed = true }
      }
      if (fm.home.teamId === null || fm.away.teamId === null) continue

      const raw = rawById.get(fm.matchId)!
      if (fm.status === 'CONCLUDED' && raw.homeScore && raw.awayScore) {
        const hs = raw.homeScore.totalScore
        const as = raw.awayScore.totalScore
        fm.winnerTeamId = hs >= as ? fm.home.teamId : fm.away.teamId
        fm.homeScore = hs
        fm.awayScore = as
        fm.isSimulated = false
      } else {
        const synthMatch: AflMatch = { ...raw, homeTeamId: fm.home.teamId, awayTeamId: fm.away.teamId }
        const p = matchHomeWinProb(synthMatch, rankMap, predMap, usePalmy, variant)
        let homeWins: boolean
        let hs: number
        let as: number
        if (random) {
          const u = Math.random()
          homeWins = u < p
          const { winnerScore, loserScore } = sampleMatchScores(u, p)
          hs = homeWins ? winnerScore : loserScore
          as = homeWins ? loserScore : winnerScore
        } else {
          const hRank = rankMap[fm.home.teamId] ?? 999
          const aRank = rankMap[fm.away.teamId] ?? 999
          homeWins = hRank < aRank
          hs = homeWins ? SIM_WIN_SCORE : SIM_LOSS_SCORE
          as = homeWins ? SIM_LOSS_SCORE : SIM_WIN_SCORE
        }
        fm.winnerTeamId = homeWins ? fm.home.teamId : fm.away.teamId
        fm.homeScore = hs
        fm.awayScore = as
        fm.isSimulated = true
      }
      outcomes.set(fm.sourceCode, {
        winnerId: fm.winnerTeamId!,
        loserId: fm.winnerTeamId === fm.home.teamId ? fm.away.teamId! : fm.home.teamId!,
      })
      changed = true
    }
  }
  return results
}

export function groupFinalsColumns(bracket: readonly FinalsBracketMatch[]): FinalsColumn[] {
  const byCode = new Map<string, FinalsBracketMatch[]>()
  for (const m of bracket) {
    if (!byCode.has(m.roundAbbreviation)) byCode.set(m.roundAbbreviation, [])
    byCode.get(m.roundAbbreviation)!.push(m)
  }
  return COLUMN_ORDER
    .filter((code) => byCode.has(code))
    .map((code) => ({ code, title: byCode.get(code)![0].roundName, matches: byCode.get(code)! }))
}
