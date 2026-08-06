import type { App, Plugin } from 'vue'
import * as components from './components'
import '../style/index.scss'

export * from './components'
export * from './utils'

function install(app: App) {
  for (const key in components) {
    const candidate = (components as Record<string, unknown>)[key] as Plugin | undefined
    // Only values carrying a runtime `install` are plugins. This barrel is
    // `export *` over every component index, so it also holds injection-key
    // symbols (Vue warns on those) and plain helper functions — and Vue treats
    // any function as an install function, so it would *call* helpers like
    // createPositionCache with the App instance as their first argument.
    if (candidate && typeof (candidate as { install?: unknown }).install === 'function')
      app.use(candidate)
  }
}

export default install
