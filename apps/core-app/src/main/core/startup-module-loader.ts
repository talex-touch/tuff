export interface StartupModuleLike {
  name?: string | symbol
}

export interface StartupModuleLoadMetric {
  name: string
  loadTime: number
  order: number
}

interface StartupModuleLoaderOptions<T extends StartupModuleLike> {
  modules: readonly T[]
  loadModule: (module: T) => Promise<boolean>
  optionalModules?: ReadonlySet<T>
  shouldSkip?: (module: T, index: number) => boolean
  onLoaded?: (module: T, metric: StartupModuleLoadMetric) => void | Promise<void>
  onOptionalModuleLoadFailed?: (module: T, metric: StartupModuleLoadMetric) => void | Promise<void>
  now?: () => number
}

export function resolveStartupModuleName(module: StartupModuleLike, fallbackIndex: number): string {
  return typeof module.name === 'string'
    ? module.name
    : typeof module.name === 'symbol'
      ? module.name.toString()
      : `Module${fallbackIndex}`
}

export async function loadStartupModules<T extends StartupModuleLike>(
  options: StartupModuleLoaderOptions<T>
): Promise<StartupModuleLoadMetric[]> {
  const now = options.now ?? Date.now
  const metrics: StartupModuleLoadMetric[] = []
  const optionalModules = options.optionalModules

  for (let i = 0; i < options.modules.length; i++) {
    const module = options.modules[i]
    if (options.shouldSkip?.(module, i)) {
      continue
    }

    const startedAt = now()
    const loaded = await options.loadModule(module)
    const loadTime = now() - startedAt
    const moduleName = resolveStartupModuleName(module, i)

    if (!loaded) {
      if (optionalModules?.has(module)) {
        const metric: StartupModuleLoadMetric = {
          name: moduleName,
          loadTime,
          order: i
        }
        await options.onOptionalModuleLoadFailed?.(module, metric)
        continue
      }
      throw new Error(`Required module failed to load: ${moduleName}`)
    }

    const metric: StartupModuleLoadMetric = {
      name: moduleName,
      loadTime,
      order: i
    }
    metrics.push(metric)
    await options.onLoaded?.(module, metric)
  }

  return metrics
}
