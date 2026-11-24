import { TxInput } from '@talex-touch/tuffex/input'
import { TxScroll } from '@talex-touch/tuffex/scroll'
import { TxSlider } from '@talex-touch/tuffex/slider'
import { initTuff } from '@talex-touch/utils/plugin/preload'
import { initializePluginTheme } from '@talex-touch/utils/plugin/theme'
import { createApp } from 'vue'
import App from './App.vue'

import './style.css'
import '@talex-touch/tuffex/base.css'
import '@talex-touch/tuffex/button/style.css'
import '@talex-touch/tuffex/input/style.css'
import '@talex-touch/tuffex/scroll/style.css'
import '@talex-touch/tuffex/slider/style.css'
import 'remixicon/fonts/remixicon.css'

import './modules/api/index'

initTuff(window)
initializePluginTheme()

const app = createApp(App)
app.component('TxScroll', TxScroll)
app.component('TxSlider', TxSlider)
app.component('TxInput', TxInput)

app.mount('#app')
