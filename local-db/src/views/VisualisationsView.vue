<script setup>
import { computed, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route  = useRoute()
const router = useRouter()

// Registry of available charts. Components are lazily loaded so a chart's code
// and its data queries only run once it's opened — nothing loads on the index.
const CHARTS = [
  {
    id: 'winprob',
    title: 'PalmyScore Win Probability',
    description: 'Favourite win rate vs predicted margin, from walk-forward predictions.',
    icon: 'mdi-chart-scatter-plot',
    component: defineAsyncComponent(() => import('@/components/charts/WinProbCard.vue')),
  },
  {
    id: 'betting-line',
    title: 'Underdog Win Rate by Closing Line',
    description: 'How often the team getting points (positive closing line) wins outright, per point.',
    icon: 'mdi-cash-multiple',
    component: defineAsyncComponent(() => import('@/components/charts/BettingLineCard.vue')),
  },
]

const selected = computed(() => CHARTS.find(c => c.id === route.query.chart) ?? null)

function open(id)  { router.push({ name: 'visualisations', query: { chart: id } }) }
function back()    { router.push({ name: 'visualisations' }) }
</script>

<template>
  <div>
    <!-- Open chart -->
    <template v-if="selected">
      <v-btn variant="text" size="small" prepend-icon="mdi-arrow-left" class="mb-3" @click="back">
        All charts
      </v-btn>
      <component :is="selected.component" />
    </template>

    <!-- Chart index -->
    <v-row v-else dense>
      <v-col v-for="chart in CHARTS" :key="chart.id" cols="12" sm="6" md="4">
        <v-card
          color="surface" rounded="lg" elevation="2" hover
          class="h-100" style="cursor:pointer" @click="open(chart.id)"
        >
          <v-card-text class="d-flex align-center ga-3">
            <v-avatar color="primary" variant="tonal" size="44">
              <v-icon :icon="chart.icon" />
            </v-avatar>
            <div>
              <div class="text-subtitle-1 font-weight-bold">{{ chart.title }}</div>
              <div class="text-caption text-medium-emphasis">{{ chart.description }}</div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>
