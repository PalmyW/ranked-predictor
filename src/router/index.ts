import { createRouter, createWebHistory } from 'vue-router'
import PredictorView from '../views/PredictorView.vue'
import StatsView from '../views/StatsView.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: PredictorView },
    { path: '/stats', component: StatsView },
    { path: '/stats/:providerId', component: StatsView },
  ],
})
