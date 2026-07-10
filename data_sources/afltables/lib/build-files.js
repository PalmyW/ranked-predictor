/**
 * Build output files in the exact on-disk shapes used by the official 2012+ data,
 * same as ../../statscache/lib/build-files.js.
 *
 * Most of that module is reused directly (re-exported below) since it's already
 * fully generic. Only `buildFixture`/`buildMatchDetails` are forked here: the
 * originals hardcode a `PW_M{mid}` match-id prefix, but this scraper's ids need the
 * `AT_M` prefix for provenance (see ../../statscache/README.md's id-prefix scheme
 * and this scraper's README.md).
 */

import { buildPlayerProfile as buildPlayerProfileShared } from '../../statscache/lib/build-files.js'

export {
  buildPlayerEntry, buildStatsFile, aggregateTeamStats,
} from '../../statscache/lib/build-files.js'

/** Same shape as the shared builder, but with the correct provenance label. */
export function buildPlayerProfile(resolved, profile) {
  return { ...buildPlayerProfileShared(resolved, profile), source: 'afltables' }
}

function teamObj(team) {
  return {
    id: team.numericId,
    providerId: team.providerId,
    name: team.name,
    abbreviation: team.abbreviation,
    nickname: team.nickname,
    teamType: 'MEN',
  }
}

function scoreObj(s) {
  return { goals: s.goals, behinds: s.behinds, totalScore: s.totalScore, superGoals: 0 }
}

export function buildFixture(year, compSeasonId, matches) {
  return {
    meta: {
      code: 200,
      source: 'afltables',
      pagination: { page: 0, numPages: 1, pageSize: 300, numEntries: matches.length },
    },
    matches: matches.map((m) => ({
      id: m.mid,
      providerId: `AT_M${m.mid}`,
      compSeason: {
        id: compSeasonId,
        providerId: `AT_S${year}`,
        name: `${year} VFL Premiership`,
        shortName: 'Premiership',
      },
      round: { roundNumber: m.roundNumber, name: m.roundName, byes: [] },
      home: { team: teamObj(m.homeTeam), score: scoreObj(m.homeScore) },
      away: { team: teamObj(m.awayTeam), score: scoreObj(m.awayScore) },
      venue: { providerId: null, name: m.venue ?? null, location: null, state: null },
      utcStartTime: m.utcStartTime,
      status: 'CONCLUDED',
    })),
  }
}

export function buildMatchDetails(m) {
  const periodScore = (periods) =>
    periods.map((p, i) => ({
      periodNumber: i + 1,
      score: { totalScore: p.goals * 6 + p.behinds, goals: p.goals, behinds: p.behinds },
    }))

  return {
    match: {
      name: `${m.homeTeam.name} Vs ${m.awayTeam.name}`,
      date: m.utcStartTime,
      status: 'CONCLUDED',
      matchId: `AT_M${m.mid}`,
      homeTeamId: m.homeTeam.providerId,
      awayTeamId: m.awayTeam.providerId,
      round: m.roundName,
    },
    venue: { name: m.venue ?? null },
    round: { name: m.roundName, year: String(m.year), roundNumber: m.roundNumber },
    score: {
      status: 'CONCLUDED',
      matchId: `AT_M${m.mid}`,
      homeTeamScore: {
        matchScore: scoreObj(m.homeScore),
        periodScore: m.periods ? periodScore(m.periods.home) : [],
      },
      awayTeamScore: {
        matchScore: scoreObj(m.awayScore),
        periodScore: m.periods ? periodScore(m.periods.away) : [],
      },
      attendance: m.attendance ?? null,
    },
  }
}
