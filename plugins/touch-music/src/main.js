import { TxInput, TxScroll, TxSlider } from '@talex-touch/tuffex'
import { createApp } from 'vue'
import App from './App.vue'

import './style.css'
import '@talex-touch/tuffex/style.css'
import 'remixicon/fonts/remixicon.css'

import './modules/api/index'

window.app = createApp(App)
window.app.component('TxScroll', TxScroll)
window.app.component('TxSlider', TxSlider)
window.app.component('TxInput', TxInput)

app.mount('#app')
