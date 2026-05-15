import { type Component, defineAsyncComponent } from 'vue'

export interface DemoModule {
  default: Component
}

export type DemoLoader = () => Promise<DemoModule>

export function createAsyncDemo(loader: DemoLoader, loadingComponent: Component, errorComponent: Component) {
  return defineAsyncComponent({
    loader,
    loadingComponent,
    errorComponent,
    delay: 200,
    timeout: 15000,
  })
}
