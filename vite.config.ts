import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/ranked-predictor/',
  optimizeDeps: {
    include: ['vuedraggable'],
  },
})
