import type { DemoLoader } from './demo-loader'

export type DemoRegistry = Record<string, DemoLoader>

let sharedDemoLoaders: DemoRegistry | null = null
let sharedRegistryPromise: Promise<DemoRegistry> | null = null

/**
 * One in-flight import of the demo registry for the whole page. The wrapper calls this the
 * moment a demo activates and the client renderer calls it when it mounts; whichever comes
 * first pays for the chunk and the other reuses the promise.
 *
 * The registry is 370+ dynamic imports and must stay out of the SSR graph, hence the dynamic
 * import here rather than a static one in either component.
 */
export function loadDemoRegistry(): Promise<DemoRegistry> {
  if (sharedDemoLoaders)
    return Promise.resolve(sharedDemoLoaders)

  sharedRegistryPromise ??= import('./demo-registry')
    .then((module) => {
      sharedDemoLoaders = module.demoLoaders
      return sharedDemoLoaders
    })
    .catch((error) => {
      // Let a later activation retry instead of pinning every demo to one failed download.
      sharedRegistryPromise = null
      throw error
    })

  return sharedRegistryPromise
}
