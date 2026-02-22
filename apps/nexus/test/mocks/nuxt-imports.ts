type RuntimeConfig = Record<string, unknown>

const fallbackConfig: RuntimeConfig = {}

export function useRuntimeConfig(): RuntimeConfig {
  const maybeConfig = (globalThis as { __NUXT_TEST_RUNTIME_CONFIG__?: RuntimeConfig }).__NUXT_TEST_RUNTIME_CONFIG__
  if (maybeConfig && typeof maybeConfig === 'object')
    return maybeConfig
  return fallbackConfig
}
