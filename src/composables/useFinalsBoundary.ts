import { LEAGUE } from '../config/league'

// Finals-boundary markers for 0-indexed ladder positions. AFL's 2026 format
// is a top-6 direct-qualify + 7-10 wildcard round (two lines); AFLW plays a
// straight top-8 with no wildcard round, so it gets a single boundary line.
export const FINALS_BOUNDARY_INDEXES: number[] = LEAGUE === 'aflw' ? [7] : [5, 9]
