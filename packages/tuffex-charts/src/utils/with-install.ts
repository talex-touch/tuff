import type { App, Component } from 'vue'

type WithInstall<T> = T & { install: (app: App) => void }

/**
 * Attaches an `install` method so a component can be registered globally via
 * `app.use(TxComponent)`. Same shape as the tuffex helper, re-declared locally
 * because this package has no runtime dependency on @talex-touch/tuffex.
 */
export function withInstall<T extends Component>(component: T): WithInstall<T> {
  const comp = component as WithInstall<T>
  comp.install = (app: App) => {
    const name = (component as Component & { name?: string }).name
    if (name)
      app.component(name, component)
  }
  return comp
}
