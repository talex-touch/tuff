import type { WidgetFailurePayload } from '@talex-touch/utils/plugin/widget'
import { shallowRef } from 'vue'

const widgetRuntimeSources = new Map<string, string[]>()
const widgetFailures = new Map<string, WidgetFailurePayload>()
const widgetFailureVersion = shallowRef(0)

function touchWidgetFailureVersion(): void {
  widgetFailureVersion.value += 1
}

export function cacheWidgetRuntimeSource(widgetId: string | undefined, code: string): void {
  if (!widgetId) return
  widgetRuntimeSources.set(widgetId, code.split('\n'))
}

export function clearWidgetRuntimeSource(widgetId?: string): void {
  if (!widgetId) return
  widgetRuntimeSources.delete(widgetId)
}

export function getWidgetRuntimeSnippet(
  widgetId: string,
  line: number,
  radius = 2
): Array<{ line: number; text: string }> {
  const lines = widgetRuntimeSources.get(widgetId)
  if (!lines || !Number.isFinite(line) || line <= 0) return []
  const start = Math.max(1, line - radius)
  const end = Math.min(lines.length, line + radius)
  const result: Array<{ line: number; text: string }> = []
  for (let current = start; current <= end; current += 1) {
    result.push({
      line: current,
      text: lines[current - 1] ?? ''
    })
  }
  return result
}

export function getWidgetFailure(widgetId: string | undefined): WidgetFailurePayload | null {
  void widgetFailureVersion.value
  if (!widgetId) return null
  return widgetFailures.get(widgetId) ?? null
}

export function clearWidgetFailure(widgetId: string): void {
  widgetFailures.delete(widgetId)
  touchWidgetFailureVersion()
}

export function recordWidgetFailure(payload: WidgetFailurePayload): void {
  widgetFailures.set(payload.widgetId, payload)
  touchWidgetFailureVersion()
}
