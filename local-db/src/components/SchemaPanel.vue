<script setup>
import { ref, onMounted } from 'vue'
import { useApi } from '@/composables/useApi.js'

const { api } = useApi()
const schema = ref({})
const loading = ref(true)

onMounted(async () => {
  try {
    schema.value = await api('/api/schema')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <v-card
    variant="outlined"
    rounded="lg"
  >
    <v-card-title class="text-caption font-weight-bold text-uppercase text-medium-emphasis pa-3 pb-1">
      <v-icon size="small" class="mr-1">mdi-database-outline</v-icon>
      Schema Reference
    </v-card-title>

    <v-progress-linear v-if="loading" indeterminate color="primary" />

    <v-list density="compact" nav class="pa-1">
      <v-list-group
        v-for="(cols, name) in schema"
        :key="name"
        :value="name"
      >
        <template #activator="{ props }">
          <v-list-item
            v-bind="props"
            :title="name"
            prepend-icon="mdi-table"
            density="compact"
          />
        </template>

        <v-list-item
          v-for="col in cols"
          :key="col"
          density="compact"
          class="pl-8"
        >
          <v-list-item-title class="text-caption font-mono">{{ col }}</v-list-item-title>
        </v-list-item>
      </v-list-group>
    </v-list>
  </v-card>
</template>
