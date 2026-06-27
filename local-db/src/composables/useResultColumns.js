import { inject } from 'vue'
import { fmt, fmtStarSign } from '@/constants/stats.js'

// Builds Tabulator column definitions from a result set's column names + first row,
// applying the app's conventions: team_id → team name, star-sign formatting, and
// right-aligned numeric columns. Shared by the SQL Query page and the Ask page so
// results render identically. Requires the injected `teamMap` (provided in App.vue).
export function useResultColumns() {
  const teamMap = inject('teamMap')

  const toLabel = s => {
    const w = s.replace(/_/g, ' ')
    return w.charAt(0).toUpperCase() + w.slice(1)
  }

  function buildColumns(columnNames, rows) {
    const tmap = teamMap?.value ?? {}
    return columnNames.map(c => {
      const isTeamId = /team_id$/i.test(c)
      const isStarSign = /star_sign$/i.test(c)
      const firstVal = rows[0]?.[c]
      const isNum = typeof firstVal === 'number'
      return {
        title: toLabel(c),
        field: c,
        formatter: cell => {
          const v = cell.getValue()
          if (isTeamId && v != null) return tmap[v] ?? v
          if (isStarSign) return fmtStarSign(v)
          return fmt(v)
        },
        sorter: isNum ? 'number' : 'string',
        hozAlign: isNum ? 'right' : 'left',
        headerHozAlign: isNum ? 'right' : 'left',
        minWidth: isTeamId ? 130 : 90,
      }
    })
  }

  return { buildColumns }
}
