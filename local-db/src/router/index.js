import { createRouter, createWebHashHistory } from 'vue-router'
import MatchesView          from '@/views/MatchesView.vue'
import PlayerMatchStatsView from '@/views/PlayerMatchStatsView.vue'
import SeasonStatsView      from '@/views/SeasonStatsView.vue'
import QueryView            from '@/views/QueryView.vue'
import PlayerView           from '@/views/PlayerView.vue'

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/',             redirect: '/matches' },
    { path: '/matches',      name: 'matches',      component: MatchesView },
    { path: '/match-stats',  name: 'match-stats',  component: PlayerMatchStatsView },
    { path: '/season-stats', name: 'season-stats', component: SeasonStatsView },
    { path: '/query',        name: 'query',        component: QueryView },
    { path: '/player',       name: 'player',       component: PlayerView },
  ],
})
