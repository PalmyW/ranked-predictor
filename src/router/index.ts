import { createRouter, createWebHistory } from 'vue-router'
import PredictorView from '../views/PredictorView.vue'
import StatsView from '../views/StatsView.vue'
import SeasonStatsView from '../views/SeasonStatsView.vue'
import AlgorithmRankingsView from '../views/AlgorithmRankingsView.vue'
import ScorePredictorView from '../views/ScorePredictorView.vue'
import FinalsView from '../views/FinalsView.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: PredictorView },
    { path: '/stats', component: StatsView },
    { path: '/stats/:providerId', component: StatsView },
    { path: '/season-stats', component: SeasonStatsView },
    { path: '/rankings', component: AlgorithmRankingsView },
    { path: '/score-predictor', component: ScorePredictorView },
    { path: '/finals', component: FinalsView },
  ],
})
