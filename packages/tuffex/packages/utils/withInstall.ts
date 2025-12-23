import type { App, Plugin } from 'vue'

type SFCwithInstall<T> = T & Plugin 

export const withInstall = <T>(component: T) => {
  (component as SFCwithInstall<T>).install = (app: App) => {
    const name = (component as any).name
    app.component(name, component as any)
  }
  return component as SFCwithInstall<T>
}