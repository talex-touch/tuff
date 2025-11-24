export const DEFAULT_WIDGET_RENDERERS = {
  CORE_PREVIEW_CARD: 'core-preview-card',
  CORE_INTELLIGENCE_ANSWER: 'core-intelligence-answer',
} as const

const values = Object.values(DEFAULT_WIDGET_RENDERERS)
export const DEFAULT_WIDGET_RENDERER_IDS = new Set<string>(values)

export function isDefaultWidgetRenderer(id: string | undefined): boolean {
  return Boolean(id) && DEFAULT_WIDGET_RENDERER_IDS.has(id)
}

export interface WidgetRegistrationPayload {
  widgetId: string
  pluginName: string
  featureId: string
  filePath: string
  code: string
  styles: string
  hash: string
}

export function makeWidgetId(pluginName: string, featureId: string): string {
  return `${pluginName}::${featureId}`
}
