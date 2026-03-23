export interface StartupHealthOptions<TMetric> {
  loadModules: () => Promise<TMetric[]>
  waitUntilInitialized: () => Promise<void>
  onHealthy?: (metrics: TMetric[]) => void | Promise<void>
}

export async function runStartupHealthCheck<TMetric>(
  options: StartupHealthOptions<TMetric>
): Promise<TMetric[]> {
  const metrics = await options.loadModules()
  await options.waitUntilInitialized()
  await options.onHealthy?.(metrics)
  return metrics
}
