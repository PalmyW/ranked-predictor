export interface AflTeam {
  id: number
  name: string
  abbreviation: string
  letter: string
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

export interface AflMatch {
  id: number
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
}

export interface LadderRow {
  teamId: number
  teamName: string
  abbreviation: string
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
}

export type TeamRanking = number[]
