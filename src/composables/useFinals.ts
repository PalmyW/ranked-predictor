import type { AflMatch, FinalsBracketMatch, FinalsColumn, FinalsSlot, FinalsSlotRule, LadderRow } from '../types/afl'
import { teamById } from './useAFLData'
import { matchHomeWinProb, homeWinProbFor, sampleMatchScores, SIM_WIN_SCORE, SIM_LOSS_SCORE, type MatchScorePrediction } from './useSimulation'
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
  // When provided (even empty), switches unplayed matches from algorithmic
  // simulation to manual picks: a match's winner is whatever team id is
  // recorded here for its matchId, or left pending (unresolved) until one
  // is. `random` is ignored in this mode.
  manualWinners?: ReadonlyMap<number, number> | null,
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
      isManualPick: false,
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
      } else if (manualWinners !== undefined && manualWinners !== null) {
        const pick = manualWinners.get(fm.matchId)
        if (pick === undefined || (pick !== fm.home.teamId && pick !== fm.away.teamId)) continue // no pick yet — stays pending
        fm.winnerTeamId = pick
        fm.isManualPick = true
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

// Slot rules resolved to array indices at template-build time so the hot
// per-sim resolver (resolveFinalsForOrder, called up to millions of times
// per Range run) never touches strings, regexes, or dictionary lookups.
type ResolvedRule =
  | { kind: 'fixed' }
  | { kind: 'seed'; position: number }
  | { kind: 'winnerOf'; matchIdx: number }
  | { kind: 'loserOf'; matchIdx: number }
  | { kind: 'rankedWinner'; rank: 'lowest' | 'highest'; matchIdxs: number[] }

interface FinalsTemplateMatch {
  matchId: number
  homeRule: ResolvedRule
  awayRule: ResolvedRule
  homeFixedTeamId: number | null
  awayFixedTeamId: number | null
  concludedWinnerId: number | null
}

export interface FinalsTemplate {
  matches: FinalsTemplateMatch[]
  grandFinalIdx: number | null
  prelimIdxs: number[]
  // Scratch buffers reused by every resolveFinalsForOrder() call against this
  // template (reset, never reallocated) — resolution always runs fully
  // synchronously before the next sim starts, so reuse is safe and avoids
  // allocating fresh arrays/objects on what can be a multi-million-call loop.
  scratchHome: (number | null)[]
  scratchAway: (number | null)[]
  scratchWinner: (number | null)[]
  scratchLoser: (number | null)[]
}

export interface FinalsSimOutcome {
  prelimFinalists: number[]
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
  const sourceCodes = finalsMatches.map(deriveSourceCode)
  const indexBySourceCode = new Map<string, number>(sourceCodes.map((c, i) => [c, i]))
  const roundCodeGroups = new Map<string, number[]>()
  sourceCodes.forEach((c, i) => {
    const roundCode = c.replace(/\d+$/, '')
    const list = roundCodeGroups.get(roundCode)
    if (list) list.push(i); else roundCodeGroups.set(roundCode, [i])
  })

  let grandFinalIdx: number | null = null

  const toResolvedRule = (rawRule: FinalsSlotRule): ResolvedRule => {
    if (rawRule.kind === 'resolved') return { kind: 'fixed' }
    if (rawRule.kind === 'seed') return { kind: 'seed', position: rawRule.position }
    if (rawRule.kind === 'result') {
      const idx = indexBySourceCode.get(rawRule.sourceCode)
      if (idx === undefined) return { kind: 'fixed' } // dangling reference — never resolves, same as upstream
      return rawRule.result === 'winner' ? { kind: 'winnerOf', matchIdx: idx } : { kind: 'loserOf', matchIdx: idx }
    }
    return { kind: 'rankedWinner', rank: rawRule.rank, matchIdxs: roundCodeGroups.get(rawRule.roundCode) ?? [] }
  }

  const templateMatches: FinalsTemplateMatch[] = finalsMatches.map((match, i) => {
    if (sourceCodes[i] === 'GF') grandFinalIdx = i

    const homeFixedTeamId = teamById(match.homeTeamId) ? match.homeTeamId : null
    const awayFixedTeamId = teamById(match.awayTeamId) ? match.awayTeamId : null

    const homeRule = homeFixedTeamId !== null ? { kind: 'fixed' as const } : toResolvedRule(parseSlotRule(match.homeTeamName))
    const awayRule = awayFixedTeamId !== null ? { kind: 'fixed' as const } : toResolvedRule(parseSlotRule(match.awayTeamName))

    let concludedWinnerId: number | null = null
    if (match.status === 'CONCLUDED' && match.homeScore && match.awayScore) {
      concludedWinnerId = match.homeScore.totalScore >= match.awayScore.totalScore ? match.homeTeamId : match.awayTeamId
    }

    return { matchId: match.id, homeRule, awayRule, homeFixedTeamId, awayFixedTeamId, concludedWinnerId }
  })

  const n = templateMatches.length
  return {
    matches: templateMatches,
    grandFinalIdx,
    prelimIdxs: roundCodeGroups.get('PF') ?? [],
    scratchHome: new Array(n).fill(null),
    scratchAway: new Array(n).fill(null),
    scratchWinner: new Array(n).fill(null),
    scratchLoser: new Array(n).fill(null),
  }
}

// Per-simulation finals resolution: seeds {kind:'seed'} slots from the
// simulated season's finishing order, then runs the same fixed-point
// slot-resolution loop as buildFinalsBracket (minus score sampling, since
// only the winner is needed) to determine who made the finals, who reached
// the Grand Final, and who won it. Shared by the CPU and GPU Range batch
// runners so both engines compute finals stats identically. Operates purely
// on the template's precomputed indices/scratch arrays — no string keys,
// regexes, or heap allocation beyond the small per-resolved-match synthMatch
// spread — since this runs once per simulated season (up to millions of
// times per Range run).
export function resolveFinalsForOrder(
  template: FinalsTemplate,
  order: readonly number[],
  rankMap: Record<number, number>,
  predMap: Map<number, MatchScorePrediction> | null,
  usePalmy: boolean,
  variant: PalmyVariant,
): FinalsSimOutcome {
  const { matches, scratchHome: homeIds, scratchAway: awayIds, scratchWinner: winnerIds, scratchLoser: loserIds } = template
  const n = matches.length
  if (n === 0) return { prelimFinalists: [], grandFinalists: [], premier: null }

  for (let i = 0; i < n; i++) {
    homeIds[i] = matches[i].homeFixedTeamId
    awayIds[i] = matches[i].awayFixedTeamId
    winnerIds[i] = null
    loserIds[i] = null
  }

  const resolveSlot = (rule: ResolvedRule): number | null => {
    switch (rule.kind) {
      case 'seed': return order[rule.position - 1] ?? null
      case 'winnerOf': return winnerIds[rule.matchIdx]
      case 'loserOf': return loserIds[rule.matchIdx]
      case 'rankedWinner': {
        let chosen: number | null = null
        let chosenSeed = rule.rank === 'highest' ? Infinity : -Infinity
        for (const idx of rule.matchIdxs) {
          const wid = winnerIds[idx]
          if (wid === null) return null
          const seed = order.indexOf(wid) + 1 || 999
          if (rule.rank === 'highest' ? seed < chosenSeed : seed > chosenSeed) { chosenSeed = seed; chosen = wid }
        }
        return chosen
      }
      default: return null
    }
  }

  let changed = true
  let guard = 0
  while (changed && guard++ <= n) {
    changed = false
    for (let i = 0; i < n; i++) {
      if (winnerIds[i] !== null) continue
      if (homeIds[i] === null) {
        const id = resolveSlot(matches[i].homeRule)
        if (id !== null) { homeIds[i] = id; changed = true }
      }
      if (awayIds[i] === null) {
        const id = resolveSlot(matches[i].awayRule)
        if (id !== null) { awayIds[i] = id; changed = true }
      }
      const hId = homeIds[i]
      const aId = awayIds[i]
      if (hId === null || aId === null) continue

      const m = matches[i]
      let winnerId: number
      if (m.concludedWinnerId !== null) {
        winnerId = m.concludedWinnerId
      } else {
        const p = homeWinProbFor(m.matchId, hId, aId, rankMap, predMap, usePalmy, variant)
        winnerId = Math.random() < p ? hId : aId
      }
      winnerIds[i] = winnerId
      loserIds[i] = winnerId === hId ? aId : hId
      changed = true
    }
  }

  const prelimFinalists: number[] = []
  for (const idx of template.prelimIdxs) {
    const hId = homeIds[idx]
    const aId = awayIds[idx]
    if (hId !== null) prelimFinalists.push(hId)
    if (aId !== null) prelimFinalists.push(aId)
  }

  const grandFinalists: number[] = []
  let premier: number | null = null
  if (template.grandFinalIdx !== null) {
    const hId = homeIds[template.grandFinalIdx]
    const aId = awayIds[template.grandFinalIdx]
    if (hId !== null) grandFinalists.push(hId)
    if (aId !== null) grandFinalists.push(aId)
    premier = winnerIds[template.grandFinalIdx]
  }
  return { prelimFinalists, grandFinalists, premier }
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
