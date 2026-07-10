/**
 * Parse a footywire season fixture page (`ft_match_list?year=YYYY`) into a list
 * of match summary rows. Each row carries the footywire match id (`mid`), the
 * round, both teams (by `th-` slug + short name), venue, crowd, final totals and
 * a parsed UTC start time.
 */

import { load } from 'cheerio'
import { parseShortDate } from './dates.js'

// Finals titles → week offset added to the last home-and-away round number.
const FINALS_WEEK = {
  'qualifying final': 1,
  'elimination final': 1,
  'semi final': 2,
  'preliminary final': 3,
  'grand final': 4,
}

export function parseFixtureList(html, year) {
  const $ = load(html)
  const matches = []
  let roundNumber = null
  let roundName = null
  let maxRegular = 0

  $('tr').each((_, tr) => {
    const $tr = $(tr)

    const titleCell = $tr.find('td.tbtitle')
    if (titleCell.length) {
      const name = titleCell.text().replace(/\s+/g, ' ').trim()
      const rm = name.match(/Round\s+(\d+)/i)
      if (rm) {
        roundNumber = Number(rm[1])
        roundName = `Round ${roundNumber}`
        maxRegular = Math.max(maxRegular, roundNumber)
      } else if (name) {
        roundName = name
        roundNumber = null // resolved after maxRegular is known
      }
      return
    }

    const resultLink = $tr.find('a[href*="ft_match_statistics?mid="]').first()
    if (!resultLink.length) return
    const mid = Number(resultLink.attr('href').match(/mid=(\d+)/)[1])
    const result = resultLink.text().trim() // "37-100"
    const scoreMatch = result.match(/(\d+)\s*-\s*(\d+)/)
    if (!scoreMatch) return

    const teamLinks = $tr.find('a[href^="th-"]')
    if (teamLinks.length < 2) return

    const cells = $tr.find('td.data')
    const dateRaw = $(cells[0]).text().replace(/\s+/g, ' ').trim()
    const venue = $(cells[2]).text().replace(/\s+/g, ' ').trim()
    const crowd = Number($(cells[3]).text().replace(/\D/g, '')) || null

    matches.push({
      mid,
      roundNumber,
      roundName: roundName ?? 'Round',
      dateRaw,
      utcStartTime: parseShortDate(dateRaw, year),
      venue,
      crowd,
      homeSlug: $(teamLinks[0]).attr('href'),
      awaySlug: $(teamLinks[1]).attr('href'),
      homeShort: $(teamLinks[0]).text().trim(),
      awayShort: $(teamLinks[1]).text().trim(),
      homeTotal: Number(scoreMatch[1]),
      awayTotal: Number(scoreMatch[2]),
    })
  })

  // Resolve finals round numbers once the last regular round is known.
  for (const m of matches) {
    if (m.roundNumber == null) {
      const wk = FINALS_WEEK[m.roundName.toLowerCase()]
      m.roundNumber = maxRegular + (wk ?? 1)
    }
  }

  return { matches, maxRegular }
}
