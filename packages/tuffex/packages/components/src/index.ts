import type { App } from 'vue'
import * as components from './components'
import '../style/index.scss'
export * from './components'

const install = (app: App) => {
  for (let n in components) {
    app.use((components as any)[n])
  }
}

export default install