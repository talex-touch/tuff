export const DEFAULT_WIDGET_RENDERERS = {
  CORE_PREVIEW_CARD: 'core-preview-card',
  CORE_INTELLIGENCE_ANSWER: 'core-intelligence-answer',
} as const

export const WIDGET_RUNTIME_BETA = 'beta' as const
export const TOUCH_WIDGET_RECOMMENDED_RUNTIME = 'arrow' as const

export const WIDGET_RUNTIMES = {
  VUE: 'vue',
  WEBCOMPONENT: 'webcomponent',
  ARROW: TOUCH_WIDGET_RECOMMENDED_RUNTIME,
} as const

export type WidgetRuntime = (typeof WIDGET_RUNTIMES)[keyof typeof WIDGET_RUNTIMES]
export type WidgetRuntimeStage = typeof WIDGET_RUNTIME_BETA | 'stable'

export const WIDGET_BETA_RUNTIMES = [
  WIDGET_RUNTIMES.WEBCOMPONENT,
  WIDGET_RUNTIMES.ARROW,
] as const

export function isBetaWidgetRuntime(runtime: WidgetRuntime | undefined): boolean {
  return runtime === WIDGET_RUNTIMES.WEBCOMPONENT || runtime === WIDGET_RUNTIMES.ARROW
}

export const WIDGET_COMPILED_DIR = '.compiled'
export const WIDGET_RUNTIME_COMPILE_ENV = 'TUFF_WIDGET_RUNTIME_COMPILE'
export const WIDGET_ALLOWED_PACKAGES = [
  '@arrow-js/core',
  'vue',
  '@talex-touch/utils',
  '@talex-touch/utils/plugin',
  '@talex-touch/utils/plugin/sdk',
  '@talex-touch/utils/core-box',
  '@talex-touch/utils/transport',
  '@talex-touch/utils/common',
  '@talex-touch/utils/types',
  '@talex-touch/tuffex',
  '@talex-touch/tuffex/ai-elements',
] as const

export const WIDGET_ALLOWED_PACKAGE_SCOPE = '@talex-touch/' as const

export type WidgetAllowedPackage = (typeof WIDGET_ALLOWED_PACKAGES)[number]

export interface WidgetPrecompiledManifestEntry {
  featureId: string
  widgetId: string
  sourcePath: string
  compiledPath: string
  metaPath?: string
  runtime?: WidgetRuntime
  runtimeStage?: WidgetRuntimeStage
  hash: string
  styles: string
  dependencies?: string[]
  compiledAt: number
}

export interface WidgetPrecompiledMeta {
  featureId: string
  widgetId: string
  sourcePath: string
  compiledPath: string
  runtime?: WidgetRuntime
  runtimeStage?: WidgetRuntimeStage
  hash: string
  styles: string
  dependencies?: string[]
  compiledAt: number
}

const values = Object.values(DEFAULT_WIDGET_RENDERERS)
export const DEFAULT_WIDGET_RENDERER_IDS = new Set<string>(values)

export function isDefaultWidgetRenderer(id: string | undefined): boolean {
  return Boolean(id) && DEFAULT_WIDGET_RENDERER_IDS.has(id!)
}

export interface WidgetRegistrationPayload {
  widgetId: string
  pluginName: string
  featureId: string
  filePath: string
  runtime?: WidgetRuntime
  runtimeStage?: WidgetRuntimeStage
  code: string
  styles: string
  hash: string
  /**
   * List of allowed module dependencies for widget sandbox
   * Widget 沙箱允许的模块依赖列表
   */
  dependencies?: string[]
}

export interface WidgetSandboxEvidence {
  widgetId: string
  pluginName: string
  featureId: string
  filePath?: string
  runtime?: WidgetRuntime
  runtimeStage?: WidgetRuntimeStage
  sourceType: string
  hash?: string
  declaredDependencies: string[]
  allowedDependencies: string[]
  blockedDependencies: string[]
  undeclaredDependencies: string[]
  storageFacade: {
    localStorage: 'secure-namespaced'
    sessionStorage: 'memory-namespaced'
    cookies: 'secure-namespaced'
    indexedDB: 'plugin-namespaced'
    caches: 'plugin-namespaced'
    broadcastChannel: 'plugin-namespaced'
  }
  windowBoundary: {
    opener: 'null'
    top: 'sandbox-proxy'
    parent: 'sandbox-proxy'
    self: 'sandbox-proxy'
    globalThis: 'sandbox-proxy'
    documentDefaultView: 'sandbox-proxy'
  }
  dynamicExecution: {
    mode: 'new-function'
    injectedGlobals: string[]
  }
}

export interface WidgetFailurePayload {
  widgetId: string
  pluginName: string
  featureId: string
  runtime?: WidgetRuntime
  runtimeStage?: WidgetRuntimeStage
  code: string
  message: string
  filePath?: string
  hash?: string
  cause?: string
  sandboxEvidence?: WidgetSandboxEvidence
}

export function makeWidgetId(pluginName: string, featureId: string): string {
  return `${pluginName}::${featureId}`
}

export function resolveWidgetRuntime(runtime: unknown): WidgetRuntime {
  if (runtime === WIDGET_RUNTIMES.WEBCOMPONENT || runtime === WIDGET_RUNTIMES.ARROW) {
    return runtime
  }
  return WIDGET_RUNTIMES.VUE
}

export function resolveWidgetRuntimeStage(runtime: WidgetRuntime | undefined): WidgetRuntimeStage {
  return isBetaWidgetRuntime(runtime) ? WIDGET_RUNTIME_BETA : 'stable'
}

export function makeSafeWidgetFileId(widgetId: string): string {
  return widgetId.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export function isAllowedWidgetModule(moduleName: string): boolean {
  const normalized = moduleName.trim()
  if (!normalized || normalized.startsWith('.') || normalized.startsWith('/')) {
    return false
  }

  return (
    normalized.startsWith(WIDGET_ALLOWED_PACKAGE_SCOPE) ||
    WIDGET_ALLOWED_PACKAGES.includes(normalized as WidgetAllowedPackage)
  )
}

export interface TouchWidgetDefinition<TProps = Record<string, unknown>> {
  runtime?: WidgetRuntime
  render?: unknown
  setup?: (props: TProps) => unknown
  tagName?: string
  define?: () => void
  [key: string]: unknown
}

export function defineTouchWidget<T extends TouchWidgetDefinition | Function>(widget: T): T {
  return widget
}
