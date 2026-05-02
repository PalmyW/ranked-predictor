declare function gtag(command: 'event', name: string, params?: Record<string, unknown>): void

function track(name: string, params?: Record<string, unknown>) {
  try {
    gtag('event', name, params)
  } catch {
    // gtag not available (e.g. blocked by ad blocker)
  }
}

export function useAnalytics() {
  return {
    /** User switched ladder tab */
    trackTabSwitch(tab: 'predicted' | 'simulated' | 'current' | 'power' | 'parity') {
      track('tab_switch', { tab })
    },

    /** User clicked Simulate */
    trackSimulate() {
      track('simulate')
    },

    /** User dragged a team to a new position */
    trackRankingDrag() {
      track('ranking_drag')
    },

    /** User changed ladder source */
    trackLadderSourceChange(source: 'live' | 'saved' | 'saved_from_shared') {
      track('ladder_source_change', { source })
    },

    /** User saved their current ranking */
    trackSaveRanking() {
      track('save_ranking')
    },

    /** User copied the share link */
    trackShareCopy() {
      track('share_copy')
    },

    /** User loaded the app with a shared ranking in the URL */
    trackSharedRankingLoaded() {
      track('shared_ranking_loaded')
    },

    /** User opened the fixture popover for a team */
    trackFixtureOpen(teamName: string) {
      track('fixture_open', { team: teamName })
    },
  }
}
