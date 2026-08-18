export interface AflTeam {
  id: number
  name: string
  abbreviation: string
  letter: string
  iconId: string  // SVG sprite symbol id e.g. "icn-aflc-adel"
  teamProviderId: string  // ChampionData team ID e.g. "CD_T10"
}

export interface AflScore {
  goals: number
  behinds: number
  totalScore: number
}

export type MatchStatus =
  | 'CONCLUDED'
  | 'LIVE'
  | 'SCHEDULED'
  | 'PLACEHOLDER'
  | 'UNCONFIRMED_TEAMS'
  | 'CONFIRMED_TEAMS'

export interface AflMatch {
  id: number
  providerId: string
  roundNumber: number
  roundName: string
  roundAbbreviation: string
  homeTeamId: number
  homeTeamName: string
  awayTeamId: number
  awayTeamName: string
  homeScore: AflScore | null
  awayScore: AflScore | null
  status: MatchStatus
  utcStartTime: string
  venueName: string | null
  finalsMatchLabel: string | null
  byeTeamIds: readonly number[]
}

export interface LadderRow {
  teamId: number
  teamName: string
  abbreviation: string
  iconId: string
  played: number
  wins: number
  losses: number
  draws: number
  pts: number
  for: number
  against: number
  percentage: number
  isFinalist: boolean
  difficulty: number | null  // avg rank of remaining opponents (lower = harder)
  remainingOpponents: Array<{ matchId: number; name: string; rank: number; isHome: boolean; predictedWin: boolean; winPct: number; roundNumber: number }>
}

export type TeamRanking = number[]

export type FinalsSlotRule =
  | { kind: 'resolved' }
  | { kind: 'seed'; position: number }
  | { kind: 'result'; result: 'winner' | 'loser'; sourceCode: string }
  | { kind: 'rankedWinner'; rank: 'lowest' | 'highest'; roundCode: string }

export interface FinalsSlot {
  teamId: number | null
  seed: number | null
  placeholderLabel: string
  rule: FinalsSlotRule
}

export interface FinalsBracketMatch {
  matchId: number
  sourceCode: string
  roundAbbreviation: string
  roundName: string
  finalsMatchLabel: string
  venueName: string | null
  utcStartTime: string
  status: MatchStatus
  home: FinalsSlot
  away: FinalsSlot
  winnerTeamId: number | null
  homeScore: number | null
  awayScore: number | null
  isSimulated: boolean
}

export interface FinalsColumn {
  code: string
  title: string
  matches: FinalsBracketMatch[]
}
