export const DEFAULT_WIDGET_RENDERERS = {
  CORE_PREVIEW_CARD: 'core-preview-card',
  CORE_INTELLIGENCE_ANSWER: 'core-intelligence-answer',
} as const

export const WIDGET_COMPILED_DIR = '.compiled'
export const WIDGET_RUNTIME_COMPILE_ENV = 'TUFF_WIDGET_RUNTIME_COMPILE'
export const WIDGET_ALLOWED_PACKAGES = [
  'vue',
  '@talex-touch/utils',
  '@talex-touch/utils/plugin',
  '@talex-touch/utils/plugin/sdk',
  '@talex-touch/utils/core-box',
  '@talex-touch/utils/transport',
  '@talex-touch/utils/common',
  '@talex-touch/utils/types',
] as const

export type WidgetAllowedPackage = (typeof WIDGET_ALLOWED_PACKAGES)[number]

export interface WidgetPrecompiledManifestEntry {
  featureId: string
  widgetId: string
  sourcePath: string
  compiledPath: string
  metaPath?: string
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
  code: string
  styles: string
  hash: string
  /**
   * List of allowed module dependencies for widget sandbox
   * Widget 沙箱允许的模块依赖列表
   */
  dependencies?: string[]
}

export interface WidgetFailurePayload {
  widgetId: string
  pluginName: string
  featureId: string
  code: string
  message: string
  filePath?: string
  hash?: string
  cause?: string
}

export function makeWidgetId(pluginName: string, featureId: string): string {
  return `${pluginName}::${featureId}`
}

export function makeSafeWidgetFileId(widgetId: string): string {
  return widgetId.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export function isAllowedWidgetModule(moduleName: string): boolean {
  if (moduleName.startsWith('.') || moduleName.startsWith('/')) {
    return false
  }

  return WIDGET_ALLOWED_PACKAGES.some(
    pkg => moduleName === pkg || moduleName.startsWith(`${pkg}/`),
  )
}
