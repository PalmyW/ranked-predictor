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

interface FinalsTemplateMatch {
  matchId: number
  sourceCode: string
  homeRule: FinalsSlotRule
  awayRule: FinalsSlotRule
  homeFixedTeamId: number | null
  awayFixedTeamId: number | null
  concludedWinnerId: number | null
  concludedLoserId: number | null
  raw: AflMatch
}

export interface FinalsTemplate {
  matches: FinalsTemplateMatch[]
  maxSeed: number
  fixedFinalists: number[]
  grandFinalCode: string | null
}

export interface FinalsSimOutcome {
  madeFinals: number[]
  grandFinalists: number[]
  premier: number | null
}

// One-time precomputation of the finals bracket's structure (slot rules,
// already-locked-in teams, already-decided results) — everything that's
// invariant across a whole Simulation Range run. Only `order` (the simulated
// regular-season ladder) differs per simulation, so per-sim resolution
// (resolveFinalsForOrder) can skip re-filtering/re-parsing the fixture.
export function buildFinalsTemplate(matches: readonly AflMatch[]): FinalsTemplate {
  const finalsMatches = matches.filter(isFinalsMatch)
  let maxSeed = 0
  let grandFinalCode: string | null = null
  const fixedFinalists = new Set<number>()

  const templateMatches: FinalsTemplateMatch[] = finalsMatches.map((match) => {
    const sourceCode = deriveSourceCode(match)
    if (sourceCode === 'GF') grandFinalCode = sourceCode

    const resolve = (teamId: number, name: string): { rule: FinalsSlotRule; fixed: number | null } => {
      if (teamById(teamId)) {
        fixedFinalists.add(teamId)
        return { rule: { kind: 'resolved' }, fixed: teamId }
      }
      const rule = parseSlotRule(name)
      if (rule.kind === 'seed') maxSeed = Math.max(maxSeed, rule.position)
      return { rule, fixed: null }
    }
    const home = resolve(match.homeTeamId, match.homeTeamName)
    const away = resolve(match.awayTeamId, match.awayTeamName)

    let concludedWinnerId: number | null = null
    let concludedLoserId: number | null = null
    if (match.status === 'CONCLUDED' && match.homeScore && match.awayScore) {
      const hs = match.homeScore.totalScore
      const as = match.awayScore.totalScore
      concludedWinnerId = hs >= as ? match.homeTeamId : match.awayTeamId
      concludedLoserId = concludedWinnerId === match.homeTeamId ? match.awayTeamId : match.homeTeamId
    }

    return {
      matchId: match.id,
      sourceCode,
      homeRule: home.rule,
      awayRule: away.rule,
      homeFixedTeamId: home.fixed,
      awayFixedTeamId: away.fixed,
      concludedWinnerId,
      concludedLoserId,
      raw: match,
    }
  })

  return { matches: templateMatches, maxSeed, fixedFinalists: [...fixedFinalists], grandFinalCode }
}

// Per-simulation finals resolution: seeds {kind:'seed'} slots from the
// simulated season's finishing order, then runs the same fixed-point
// slot-resolution loop as buildFinalsBracket (minus score sampling, since
// only the winner is needed) to determine who made the finals, who reached
// the Grand Final, and who won it. Shared by the CPU and GPU Range batch
// runners so both engines compute finals stats identically.
export function resolveFinalsForOrder(
  template: FinalsTemplate,
  order: readonly number[],
  rankMap: Record<number, number>,
  predMap: Map<number, MatchScorePrediction> | null,
  usePalmy: boolean,
  variant: PalmyVariant,
): FinalsSimOutcome {
  if (template.matches.length === 0) return { madeFinals: [], grandFinalists: [], premier: null }

  const madeFinals = template.maxSeed > 0 ? order.slice(0, template.maxSeed) : template.fixedFinalists

  const outcomes: Record<string, { winnerId: number; loserId: number }> = {}
  const homeIds: Record<string, number | null> = {}
  const awayIds: Record<string, number | null> = {}
  for (const m of template.matches) {
    homeIds[m.sourceCode] = m.homeFixedTeamId
    awayIds[m.sourceCode] = m.awayFixedTeamId
  }

  const resolveSlot = (rule: FinalsSlotRule): number | null => {
    if (rule.kind === 'seed') return order[rule.position - 1] ?? null
    if (rule.kind === 'result') {
      const o = outcomes[rule.sourceCode]
      if (!o) return null
      return rule.result === 'winner' ? o.winnerId : o.loserId
    }
    if (rule.kind === 'rankedWinner') {
      const codes = template.matches.map((m) => m.sourceCode).filter((c) => c.replace(/\d+$/, '') === rule.roundCode)
      if (codes.length === 0 || !codes.every((c) => outcomes[c])) return null
      const winners = codes.map((c) => outcomes[c].winnerId)
      const seeds = winners.map((id) => ({ id, seed: order.indexOf(id) + 1 || 999 }))
      seeds.sort((a, b) => a.seed - b.seed)
      return rule.rank === 'highest' ? seeds[0].id : seeds[seeds.length - 1].id
    }
    return null
  }

  let changed = true
  let guard = 0
  while (changed && guard++ <= template.matches.length) {
    changed = false
    for (const m of template.matches) {
      if (outcomes[m.sourceCode]) continue
      if (homeIds[m.sourceCode] === null) {
        const id = resolveSlot(m.homeRule)
        if (id !== null) { homeIds[m.sourceCode] = id; changed = true }
      }
      if (awayIds[m.sourceCode] === null) {
        const id = resolveSlot(m.awayRule)
        if (id !== null) { awayIds[m.sourceCode] = id; changed = true }
      }
      const hId = homeIds[m.sourceCode]
      const aId = awayIds[m.sourceCode]
      if (hId === null || aId === null) continue

      let winnerId: number
      if (m.concludedWinnerId !== null) {
        winnerId = m.concludedWinnerId
      } else {
        const synthMatch: AflMatch = { ...m.raw, homeTeamId: hId, awayTeamId: aId }
        const p = matchHomeWinProb(synthMatch, rankMap, predMap, usePalmy, variant)
        winnerId = Math.random() < p ? hId : aId
      }
      outcomes[m.sourceCode] = { winnerId, loserId: winnerId === hId ? aId : hId }
      changed = true
    }
  }

  const gf = template.grandFinalCode ? template.matches.find((m) => m.sourceCode === template.grandFinalCode) : undefined
  const grandFinalists: number[] = []
  let premier: number | null = null
  if (gf) {
    const hId = homeIds[gf.sourceCode]
    const aId = awayIds[gf.sourceCode]
    if (hId !== null) grandFinalists.push(hId)
    if (aId !== null) grandFinalists.push(aId)
    premier = outcomes[gf.sourceCode]?.winnerId ?? null
  }
  return { madeFinals, grandFinalists, premier }
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
