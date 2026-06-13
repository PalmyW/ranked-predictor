import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import { md3 } from 'vuetify/blueprints'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import router from './router/index.js'
import App from './App.vue'
import './assets/main.css'

const vuetify = createVuetify({
  blueprint: md3,
  components,
  directives,
  theme: {
    defaultTheme: 'aflDark',
    themes: {
      aflDark: {
        dark: true,
        colors: {
          primary:    '#4f7ef7',
          secondary:  '#6b46c1',
          surface:    '#1a1d27',
          background: '#0f1117',
          error:      '#f56565',
          success:    '#48bb78',
          warning:    '#ecc94b',
        },
      },
    },
  },
})

createApp(App).use(vuetify).use(router).mount('#app')
