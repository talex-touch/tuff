import { createApp } from 'vue'
import './asset/style/index.scss'
import App from './App.vue'
import router from './router/index'

// 全局引入组件
import EasyDesign from '../../../packages/components/src/index'
import '../../../packages/components/style/index.scss'

const app = createApp(App)
app.use(EasyDesign)
app.use(router)
app.mount('#app')
