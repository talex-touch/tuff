import type { App, Component } from 'vue'
import * as tuffexComponents from '@talex-touch/tuffex'

type InstallableComponent = Component & {
  install?: (app: App) => unknown
}

function isInstallableComponent(value: unknown): value is InstallableComponent {
  if (!value)
    return false

  const valueType = typeof value
  if (valueType !== 'object' && valueType !== 'function')
    return false

  return typeof (value as InstallableComponent).install === 'function'
}

export default defineNuxtPlugin((nuxtApp) => {
  const exportsMap = tuffexComponents as Record<string, unknown>
  const registered = new Set<string>()

  const registerComponent = (name: string, exported: unknown) => {
    if (!isInstallableComponent(exported))
      return
    if (registered.has(name))
      return
    nuxtApp.vueApp.component(name, exported)
    registered.add(name)
  }

  for (const [name, exported] of Object.entries(exportsMap)) {
    if (name === 'default')
      continue

    registerComponent(name, exported)
  }

  for (const [name, exported] of Object.entries(exportsMap)) {
    if (!name.startsWith('Tuff'))
      continue

    const txAlias = `Tx${name.slice(4)}`
    const hasRealTxComponent = isInstallableComponent(exportsMap[txAlias])
    if (hasRealTxComponent)
      continue

    registerComponent(txAlias, exported)
  }
})
