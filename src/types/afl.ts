export interface AflTeam {
  id: number
  name: string
  abbreviation: string
  letter: string
  iconId: string  // SVG sprite symbol id e.g. "icn-aflc-adel"
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
  homeTeamId: number
  homeTeamName: string
  awayTeamId: number
  awayTeamName: string
  homeScore: AflScore | null
  awayScore: AflScore | null
  status: MatchStatus
  utcStartTime: string
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
