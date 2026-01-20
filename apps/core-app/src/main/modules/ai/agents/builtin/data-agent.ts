/**
 * DataAgent - 数据处理智能体
 *
 * 能力:
 * - 数据提取与转换
 * - 格式转换
 * - 数据清洗
 * - 简单分析
 */

import type { AgentDescriptor, AgentPlanStep } from '@talex-touch/utils'
import type { AgentExecutionContext, AgentImpl } from '../agent-registry'
import { agentRegistry } from '../agent-registry'

const DATA_AGENT_ID = 'builtin.data-agent'

const descriptor: AgentDescriptor = {
  id: DATA_AGENT_ID,
  name: 'Data Agent',
  description: '智能数据处理助手，支持数据提取、格式转换、清洗和分析',
  version: '1.0.0',
  capabilities: [
    {
      id: 'data.extract',
      name: '数据提取',
      type: 'action',
      description: '从文本或文件中提取结构化数据',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: '数据源 (文本或文件路径)' },
          sourceType: { type: 'string', description: '源类型: text, file, url' },
          schema: {
            type: 'object',
            description: '期望的数据结构'
          },
          format: { type: 'string', description: '源格式: json, csv, xml, text' }
        },
        required: ['source']
      },
      outputSchema: {
        type: 'object',
        properties: {
          data: { type: 'object' },
          metadata: { type: 'object' }
        }
      }
    },
    {
      id: 'data.transform',
      name: '数据转换',
      type: 'action',
      description: '转换数据结构或格式',
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'object', description: '输入数据' },
          transforms: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', description: '转换类型: map, filter, reduce, sort' },
                config: { type: 'object' }
              }
            }
          }
        },
        required: ['data', 'transforms']
      },
      outputSchema: {
        type: 'object',
        properties: {
          result: { type: 'object' },
          applied: { type: 'array' }
        }
      }
    },
    {
      id: 'data.format',
      name: '格式转换',
      type: 'action',
      description: '在不同数据格式间转换',
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'object', description: '输入数据' },
          fromFormat: { type: 'string', description: '源格式: json, csv, xml, yaml' },
          toFormat: { type: 'string', description: '目标格式: json, csv, xml, yaml' },
          options: { type: 'object', description: '格式化选项' }
        },
        required: ['data', 'toFormat']
      },
      outputSchema: {
        type: 'object',
        properties: {
          output: { type: 'string' },
          format: { type: 'string' }
        }
      }
    },
    {
      id: 'data.clean',
      name: '数据清洗',
      type: 'action',
      description: '清洗和规范化数据',
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'object', description: '输入数据' },
          rules: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                action: {
                  type: 'string',
                  description: '清洗动作: trim, lowercase, removeEmpty, dedupe'
                }
              }
            }
          }
        },
        required: ['data']
      },
      outputSchema: {
        type: 'object',
        properties: {
          cleaned: { type: 'object' },
          changes: { type: 'number' },
          removed: { type: 'number' }
        }
      }
    },
    {
      id: 'data.analyze',
      name: '数据分析',
      type: 'query',
      description: '对数据进行简单统计分析',
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'array', description: '数据数组' },
          metrics: {
            type: 'array',
            items: { type: 'string' },
            description: '分析指标: count, sum, avg, min, max, distribution'
          },
          groupBy: { type: 'string', description: '分组字段' }
        },
        required: ['data']
      },
      outputSchema: {
        type: 'object',
        properties: {
          summary: { type: 'object' },
          groups: { type: 'object' }
        }
      }
    }
  ],
  tools: [{ toolId: 'file.read' }, { toolId: 'file.write' }],
  enabled: true
}

const implementation: AgentImpl = {
  async execute(input: unknown, ctx: AgentExecutionContext): Promise<unknown> {
    const { capability, ...params } = input as { capability: string; [key: string]: unknown }

    switch (capability) {
      case 'data.extract':
        return executeExtract(params, ctx)
      case 'data.transform':
        return executeTransform(params, ctx)
      case 'data.format':
        return executeFormat(params, ctx)
      case 'data.clean':
        return executeClean(params, ctx)
      case 'data.analyze':
        return executeAnalyze(params, ctx)
      default:
        throw new Error(`Unknown capability: ${capability}`)
    }
  },

  async plan(input: unknown, _ctx: AgentExecutionContext): Promise<AgentPlanStep[]> {
    const { goal } = input as { goal: string }
    const steps: AgentPlanStep[] = []

    if (goal.includes('提取') || goal.includes('extract')) {
      steps.push({
        id: 'extract',
        toolId: 'data.extract',
        input: {},
        description: '提取数据'
      })
    }

    if (goal.includes('转换') || goal.includes('transform') || goal.includes('格式')) {
      steps.push({
        id: 'transform',
        toolId: 'data.transform',
        input: {},
        description: '转换数据'
      })
    }

    if (goal.includes('清洗') || goal.includes('clean') || goal.includes('清理')) {
      steps.push({
        id: 'clean',
        toolId: 'data.clean',
        input: {},
        description: '清洗数据'
      })
    }

    if (goal.includes('分析') || goal.includes('analyze') || goal.includes('统计')) {
      steps.push({
        id: 'analyze',
        toolId: 'data.analyze',
        input: {},
        description: '分析数据'
      })
    }

    return steps
  }
}

// ============================================================================
// Capability Implementations
// ============================================================================

async function executeExtract(
  params: Record<string, unknown>,
  _ctx: AgentExecutionContext
): Promise<unknown> {
  const {
    source,
    sourceType = 'text',
    format = 'json'
  } = params as {
    source: string
    sourceType?: string
    format?: string
  }

  let data: unknown = null

  try {
    if (format === 'json') {
      data = JSON.parse(source)
    } else if (format === 'csv') {
      data = parseCSV(source)
    } else {
      data = { raw: source }
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse ${format}: ${err}`,
      source
    }
  }

  return {
    success: true,
    data,
    metadata: {
      sourceType,
      format,
      extractedAt: new Date().toISOString()
    }
  }
}

async function executeTransform(
  params: Record<string, unknown>,
  _ctx: AgentExecutionContext
): Promise<unknown> {
  const { data, transforms } = params as {
    data: unknown
    transforms: Array<{ type: string; config?: Record<string, unknown> }>
  }

  let result = data
  const applied: string[] = []

  for (const transform of transforms) {
    switch (transform.type) {
      case 'map':
        if (Array.isArray(result) && transform.config?.field) {
          result = result.map(
            (item: Record<string, unknown>) => item[transform.config!.field as string]
          )
          applied.push(`map:${transform.config.field}`)
        }
        break

      case 'filter':
        if (Array.isArray(result) && transform.config?.condition) {
          // Simple filter by field existence
          result = result.filter((item: Record<string, unknown>) =>
            Boolean(item[transform.config!.condition as string])
          )
          applied.push(`filter:${transform.config.condition}`)
        }
        break

      case 'sort':
        if (Array.isArray(result) && transform.config?.field) {
          const field = transform.config.field as string
          const order = transform.config.order === 'desc' ? -1 : 1
          result = [...result].sort((a, b) => {
            if (a[field] < b[field]) return -1 * order
            if (a[field] > b[field]) return 1 * order
            return 0
          })
          applied.push(`sort:${field}`)
        }
        break

      default:
        applied.push(`unknown:${transform.type}`)
    }
  }

  return { result, applied }
}

async function executeFormat(
  params: Record<string, unknown>,
  _ctx: AgentExecutionContext
): Promise<unknown> {
  const {
    data,
    toFormat,
    options = {}
  } = params as {
    data: unknown
    toFormat: string
    options?: Record<string, unknown>
  }

  let output: string

  switch (toFormat) {
    case 'json':
      output = JSON.stringify(data, null, (options.indent as number) || 2)
      break

    case 'csv':
      output = toCSV(data)
      break

    case 'yaml':
      output = toYAML(data)
      break

    default:
      output = String(data)
  }

  return { output, format: toFormat }
}

async function executeClean(
  params: Record<string, unknown>,
  _ctx: AgentExecutionContext
): Promise<unknown> {
  const { data, rules = [] } = params as {
    data: unknown
    rules?: Array<{ field?: string; action: string }>
  }

  let cleaned = JSON.parse(JSON.stringify(data))
  let changes = 0
  let removed = 0

  // Default rules if none provided
  const effectiveRules = rules.length > 0 ? rules : [{ action: 'trim' }, { action: 'removeEmpty' }]

  for (const rule of effectiveRules) {
    switch (rule.action) {
      case 'trim':
        changes += trimStrings(cleaned)
        break

      case 'lowercase':
        changes += lowercaseStrings(cleaned)
        break

      case 'removeEmpty': {
        const removedCount = removeEmpty(cleaned)
        removed += removedCount
        changes += removedCount
        break
      }

      case 'dedupe':
        if (Array.isArray(cleaned)) {
          const before = cleaned.length
          cleaned = [...new Set(cleaned.map((x) => JSON.stringify(x)))].map((x) => JSON.parse(x))
          removed += before - cleaned.length
          changes += before - cleaned.length
        }
        break
    }
  }

  return { cleaned, changes, removed }
}

async function executeAnalyze(
  params: Record<string, unknown>,
  _ctx: AgentExecutionContext
): Promise<unknown> {
  const {
    data,
    metrics = ['count'],
    groupBy
  } = params as {
    data: unknown[]
    metrics?: string[]
    groupBy?: string
  }

  if (!Array.isArray(data)) {
    return { error: 'Data must be an array', data }
  }

  const summary: Record<string, unknown> = {}

  if (metrics.includes('count')) {
    summary.count = data.length
  }

  // Numeric analysis for number arrays
  const numbers = data.filter((x) => typeof x === 'number') as number[]
  if (numbers.length > 0) {
    if (metrics.includes('sum')) {
      summary.sum = numbers.reduce((a, b) => a + b, 0)
    }
    if (metrics.includes('avg')) {
      summary.avg = numbers.reduce((a, b) => a + b, 0) / numbers.length
    }
    if (metrics.includes('min')) {
      summary.min = Math.min(...numbers)
    }
    if (metrics.includes('max')) {
      summary.max = Math.max(...numbers)
    }
  }

  // Group by field
  let groups: Record<string, unknown[]> | undefined
  if (groupBy && data.length > 0 && typeof data[0] === 'object') {
    groups = {}
    for (const item of data as Record<string, unknown>[]) {
      const key = String(item[groupBy] || 'undefined')
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    }
  }

  return { summary, groups }
}

// ============================================================================
// Helpers
// ============================================================================

function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map((h) => h.trim())
  const data: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, j) => {
      row[h] = values[j] || ''
    })
    data.push(row)
  }

  return data
}

function toCSV(data: unknown): string {
  if (!Array.isArray(data) || data.length === 0) return ''

  const first = data[0]
  if (typeof first !== 'object' || first === null) {
    return data.join('\n')
  }

  const headers = Object.keys(first)
  const lines = [headers.join(',')]

  for (const item of data as Record<string, unknown>[]) {
    const values = headers.map((h) => String(item[h] ?? ''))
    lines.push(values.join(','))
  }

  return lines.join('\n')
}

function toYAML(data: unknown, indent = 0): string {
  const prefix = '  '.repeat(indent)

  if (data === null || data === undefined) return 'null'
  if (typeof data === 'string') return data
  if (typeof data === 'number' || typeof data === 'boolean') return String(data)

  if (Array.isArray(data)) {
    return data.map((item) => `${prefix}- ${toYAML(item, indent + 1)}`).join('\n')
  }

  if (typeof data === 'object') {
    return Object.entries(data)
      .map(([key, value]) => `${prefix}${key}: ${toYAML(value, indent + 1)}`)
      .join('\n')
  }

  return String(data)
}

function trimStrings(obj: unknown): number {
  let count = 0
  if (typeof obj === 'object' && obj !== null) {
    for (const key of Object.keys(obj)) {
      const val = (obj as Record<string, unknown>)[key]
      if (typeof val === 'string') {
        const trimmed = val.trim()
        if (trimmed !== val) {
          ;(obj as Record<string, unknown>)[key] = trimmed
          count++
        }
      } else if (typeof val === 'object') {
        count += trimStrings(val)
      }
    }
  }
  return count
}

function lowercaseStrings(obj: unknown): number {
  let count = 0
  if (typeof obj === 'object' && obj !== null) {
    for (const key of Object.keys(obj)) {
      const val = (obj as Record<string, unknown>)[key]
      if (typeof val === 'string') {
        ;(obj as Record<string, unknown>)[key] = val.toLowerCase()
        count++
      } else if (typeof val === 'object') {
        count += lowercaseStrings(val)
      }
    }
  }
  return count
}

function removeEmpty(obj: unknown): number {
  let count = 0
  if (typeof obj === 'object' && obj !== null) {
    for (const key of Object.keys(obj)) {
      const val = (obj as Record<string, unknown>)[key]
      if (val === '' || val === null || val === undefined) {
        delete (obj as Record<string, unknown>)[key]
        count++
      } else if (typeof val === 'object') {
        count += removeEmpty(val)
      }
    }
  }
  return count
}

// ============================================================================
// Registration
// ============================================================================

export function registerDataAgent(): void {
  agentRegistry.registerAgent(descriptor, implementation)
}

export { DATA_AGENT_ID, descriptor as dataAgentDescriptor }
