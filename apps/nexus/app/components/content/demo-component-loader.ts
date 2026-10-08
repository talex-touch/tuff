import type { DemoLoader, DemoModule } from './demo-loader'

declare const __NEXUS_DEMO_LOADER_BASE__: string

const pendingDemos = new Map<string, Promise<DemoModule>>()

export function loadDemoComponent(name: string): Promise<DemoModule> {
  const existing = pendingDemos.get(name)
  if (existing)
    return existing

  const request = (async (): Promise<DemoModule> => {
    if (import.meta.dev) {
      // Dev-only runtime registry; static import would also enter the production graph.
      const { demoLoaders } = await import('./demo-registry')
      const loader = demoLoaders[name]
      if (!loader)
        throw new Error(`Unknown demo: ${name}`)
      return loader()
    }
    const url = `${__NEXUS_DEMO_LOADER_BASE__}${encodeURIComponent(name)}.js`
    const entry: { default: DemoLoader } = await import(/* @vite-ignore */ url)
    return entry.default()
  })().catch((error) => {
    pendingDemos.delete(name)
    throw error
  })
  pendingDemos.set(name, request)
  return request
}
