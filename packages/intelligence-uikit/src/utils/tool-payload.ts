import type { AiToolCallPart } from '@talex-touch/tuffex/ai-elements'
import type { FormSpec, WidgetSpec } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { CHART_RESULT_PREFIX, FORM_RESULT_PREFIX, WIDGET_RESULT_PREFIX } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type { TxAiToolChartSpec } from '../types'

/** Only settled tool results can become interactive faces. */
export function parseToolResult<T>(tool: AiToolCallPart, prefix: string): T | null {
  if (tool.status !== 'done' || !tool.output?.startsWith(prefix)) return null
  try {
    return JSON.parse(tool.output.slice(prefix.length)) as T
  } catch {
    return null
  }
}

export type TxAiToolFace =
  | { kind: 'chart'; spec: TxAiToolChartSpec }
  | { kind: 'form'; spec: FormSpec }
  | { kind: 'widget'; spec: WidgetSpec }

/** Built-in names and result envelopes share the agent-tools public protocol. */
export function toolFaceOf(tool: AiToolCallPart): TxAiToolFace | null {
  if (tool.name === 'tuff_render_chart' || tool.output?.startsWith(CHART_RESULT_PREFIX)) {
    const spec = parseToolResult<TxAiToolChartSpec>(tool, CHART_RESULT_PREFIX)
    if (spec && typeof spec.type === 'string' && Array.isArray(spec.labels) && Array.isArray(spec.series)) return { kind: 'chart', spec }
  }
  if (tool.name === 'tuff_render_form' || tool.output?.startsWith(FORM_RESULT_PREFIX)) {
    const spec = parseToolResult<FormSpec>(tool, FORM_RESULT_PREFIX)
    if (spec && Array.isArray(spec.fields)) return { kind: 'form', spec }
  }
  if (tool.name === 'tuff_render_widget' || tool.output?.startsWith(WIDGET_RESULT_PREFIX)) {
    const spec = parseToolResult<WidgetSpec>(tool, WIDGET_RESULT_PREFIX)
    if (spec && typeof spec.source === 'string' && spec.source) return { kind: 'widget', spec }
  }
  return null
}
