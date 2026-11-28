import { createApp } from 'vue'
import App from './App.vue'
import { applyTheme } from './composables/useTheme'
import { i18n } from './i18n'
import { createConsoleRouter } from './router'
import '@talex-touch/tuffex/base.css'
import 'uno.css'
import './styles/console.css'

applyTheme()

const app = createApp(App)
const router = createConsoleRouter()

app.use(i18n)
app.use(router)
app.mount('#app')
