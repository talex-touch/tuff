import type { App } from 'vue'
import * as components from './components'
import '@talex-touch/tuffex/style.css'
import './style/index.scss'

export * from './components'
export * from './types'

export function install(app: App) {
  for (const component of Object.values(components)) {
    const name = (component as any).name
    if (name)
      app.component(name, component as any)
  }
}

export default install
