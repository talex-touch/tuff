import { TxInput } from '@talex-touch/tuffex/input'
import { TxScroll } from '@talex-touch/tuffex/scroll'
import { TxSlider } from '@talex-touch/tuffex/slider'
import { createApp } from 'vue'
import App from './App.vue'

import './style.css'
import '@talex-touch/tuffex/base.css'
import '@talex-touch/tuffex/input/style.css'
import '@talex-touch/tuffex/scroll/style.css'
import '@talex-touch/tuffex/slider/style.css'
import 'remixicon/fonts/remixicon.css'

import './modules/api/index'

window.app = createApp(App)
window.app.component('TxScroll', TxScroll)
window.app.component('TxSlider', TxSlider)
window.app.component('TxInput', TxInput)

app.mount('#app')
