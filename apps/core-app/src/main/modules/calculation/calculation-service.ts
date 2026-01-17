import type { PreviewCardPayload } from '@talex-touch/utils/core-box'
import type { ExpressionResult } from './expression-evaluator'
import type { UnitConversionResult } from './unit-converter'
import { evaluateExpression, looksLikeExpression } from './expression-evaluator'
import { looksLikeUnitConversion, parseUnitConversion } from './unit-converter'

export type CalculationType = 'expression' | 'unit' | 'none'

export interface CalculationResult {
  type: CalculationType
  success: boolean
  query: string
  expression?: ExpressionResult
  unit?: UnitConversionResult
  previewCard?: PreviewCardPayload
}

const MAX_QUERY_LENGTH = 500
const TIMEOUT_MS = 50

/**
 * Identify and evaluate a calculation query
 */
export function processCalculation(query: string): CalculationResult {
  const trimmed = query.trim()

  if (!trimmed || trimmed.length > MAX_QUERY_LENGTH) {
    return { type: 'none', success: false, query }
  }

  const startTime = Date.now()

  // Try unit conversion first (more specific pattern)
  if (looksLikeUnitConversion(trimmed)) {
    const result = parseUnitConversion(trimmed)
    if (result?.success) {
      return {
        type: 'unit',
        success: true,
        query,
        unit: result,
        previewCard: buildUnitPreviewCard(result)
      }
    }
  }

  // Check timeout
  if (Date.now() - startTime > TIMEOUT_MS) {
    return { type: 'none', success: false, query }
  }

  // Try expression evaluation
  if (looksLikeExpression(trimmed)) {
    const result = evaluateExpression(trimmed)
    if (result.success) {
      return {
        type: 'expression',
        success: true,
        query,
        expression: result,
        previewCard: buildExpressionPreviewCard(result)
      }
    }
  }

  return { type: 'none', success: false, query }
}

function buildExpressionPreviewCard(result: ExpressionResult): PreviewCardPayload {
  return {
    abilityId: 'tuff.calculation.expression',
    subtitle: '计算',
    primaryLabel: '结果',
    primaryValue: result.value ?? '--',
    title: result.expression,
    chips: [],
    sections: [],
    badges: ['mathjs']
  }
}

function buildUnitPreviewCard(result: UnitConversionResult): PreviewCardPayload {
  const categoryLabels: Record<string, string> = {
    length: '长度',
    mass: '质量',
    temperature: '温度',
    data: '数据量',
    time: '时间',
    area: '面积',
    volume: '体积',
    speed: '速度'
  }

  return {
    abilityId: 'tuff.calculation.unit',
    subtitle: categoryLabels[result.category ?? ''] ?? '单位换算',
    title: result.formatted ?? '',
    primaryLabel: result.toUnit,
    primaryValue: result.value?.toString() ?? '--',
    primaryUnit: result.toUnit,
    secondaryLabel: '原始值',
    secondaryValue: `${result.fromValue} ${result.fromUnit}`,
    chips: [{ label: '类型', value: result.category ?? 'unknown' }],
    sections: [],
    badges: []
  }
}

/**
 * Quick check if query might be a calculation
 */
export function mightBeCalculation(query: string): boolean {
  const trimmed = query.trim()
  if (!trimmed || trimmed.length > MAX_QUERY_LENGTH) {
    return false
  }
  return looksLikeExpression(trimmed) || looksLikeUnitConversion(trimmed)
}
