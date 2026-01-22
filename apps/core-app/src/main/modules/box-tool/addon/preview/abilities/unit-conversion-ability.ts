import type { PreviewAbilityResult, PreviewCardPayload } from '@talex-touch/utils'
import type { PreviewAbilityContext } from '../preview-ability'
import { performance } from 'node:perf_hooks'
import { BasePreviewAbility } from '../preview-ability'

interface UnitConverter {
  category: string
  toBase: (value: number) => number
  fromBase: (value: number) => number
  display: string
}

function LINEAR(factor: number): Pick<UnitConverter, 'toBase' | 'fromBase'> {
  return {
    toBase: (value: number) => value * factor,
    fromBase: (value: number) => value / factor
  }
}

const UNIT_TABLE: Record<string, UnitConverter> = {
  mm: { category: 'length', display: '毫米', ...LINEAR(0.001) },
  millimeter: { category: 'length', display: '毫米', ...LINEAR(0.001) },
  centimeter: { category: 'length', display: '厘米', ...LINEAR(0.01) },
  cm: { category: 'length', display: '厘米', ...LINEAR(0.01) },
  m: { category: 'length', display: '米', ...LINEAR(1) },
  meter: { category: 'length', display: '米', ...LINEAR(1) },
  metre: { category: 'length', display: '米', ...LINEAR(1) },
  米: { category: 'length', display: '米', ...LINEAR(1) },
  km: { category: 'length', display: '千米', ...LINEAR(1000) },
  kilometer: { category: 'length', display: '千米', ...LINEAR(1000) },
  kilometre: { category: 'length', display: '千米', ...LINEAR(1000) },
  千米: { category: 'length', display: '千米', ...LINEAR(1000) },
  in: { category: 'length', display: '英寸', ...LINEAR(0.0254) },
  inch: { category: 'length', display: '英寸', ...LINEAR(0.0254) },
  inches: { category: 'length', display: '英寸', ...LINEAR(0.0254) },
  ft: { category: 'length', display: '英尺', ...LINEAR(0.3048) },
  foot: { category: 'length', display: '英尺', ...LINEAR(0.3048) },
  feet: { category: 'length', display: '英尺', ...LINEAR(0.3048) },
  yd: { category: 'length', display: '码', ...LINEAR(0.9144) },
  mi: { category: 'length', display: '英里', ...LINEAR(1609.344) },
  mile: { category: 'length', display: '英里', ...LINEAR(1609.344) },
  miles: { category: 'length', display: '英里', ...LINEAR(1609.344) },

  mg: { category: 'mass', display: '毫克', ...LINEAR(1e-6) },
  g: { category: 'mass', display: '克', ...LINEAR(0.001) },
  gram: { category: 'mass', display: '克', ...LINEAR(0.001) },
  克: { category: 'mass', display: '克', ...LINEAR(0.001) },
  kg: { category: 'mass', display: '千克', ...LINEAR(1) },
  kilogram: { category: 'mass', display: '千克', ...LINEAR(1) },
  千克: { category: 'mass', display: '千克', ...LINEAR(1) },
  公斤: { category: 'mass', display: '公斤', ...LINEAR(1) },
  斤: { category: 'mass', display: '斤', ...LINEAR(0.5) },
  两: { category: 'mass', display: '两', ...LINEAR(0.05) },
  lb: { category: 'mass', display: '磅', ...LINEAR(0.45359237) },
  pound: { category: 'mass', display: '磅', ...LINEAR(0.45359237) },
  pounds: { category: 'mass', display: '磅', ...LINEAR(0.45359237) },
  oz: { category: 'mass', display: '盎司', ...LINEAR(0.0283495231) },
  t: { category: 'mass', display: '吨', ...LINEAR(1000) },
  ton: { category: 'mass', display: '吨', ...LINEAR(1000) },
  tons: { category: 'mass', display: '吨', ...LINEAR(1000) },
  tonne: { category: 'mass', display: '吨', ...LINEAR(1000) },
  吨: { category: 'mass', display: '吨', ...LINEAR(1000) },

  ml: { category: 'volume', display: '毫升', ...LINEAR(0.001) },
  l: { category: 'volume', display: '升', ...LINEAR(1) },
  liter: { category: 'volume', display: '升', ...LINEAR(1) },
  litre: { category: 'volume', display: '升', ...LINEAR(1) },
  gal: { category: 'volume', display: '加仑', ...LINEAR(3.78541) },
  gallon: { category: 'volume', display: '加仑', ...LINEAR(3.78541) },
  cup: { category: 'volume', display: '杯', ...LINEAR(0.236588) },

  bit: { category: 'data', display: '比特', ...LINEAR(1) },
  b: { category: 'data', display: '比特', ...LINEAR(1) },
  byte: { category: 'data', display: '字节', ...LINEAR(8) },
  B: { category: 'data', display: '字节', ...LINEAR(8) },
  kb: { category: 'data', display: '千比特', ...LINEAR(1000) },
  kib: { category: 'data', display: '千二进制比特', ...LINEAR(1024) },
  mb: { category: 'data', display: '兆比特', ...LINEAR(1e6) },
  mib: { category: 'data', display: '兆二进制比特', ...LINEAR(1024 * 1024) },
  gb: { category: 'data', display: '吉比特', ...LINEAR(1e9) },
  gib: { category: 'data', display: '吉二进制比特', ...LINEAR(1024 * 1024 * 1024) },

  c: {
    category: 'temperature',
    display: '摄氏度',
    toBase: (value: number) => value,
    fromBase: (value: number) => value
  },
  '℃': {
    category: 'temperature',
    display: '摄氏度',
    toBase: (value: number) => value,
    fromBase: (value: number) => value
  },
  f: {
    category: 'temperature',
    display: '华氏度',
    toBase: (value: number) => ((value - 32) * 5) / 9,
    fromBase: (value: number) => (value * 9) / 5 + 32
  },
  k: {
    category: 'temperature',
    display: '开尔文',
    toBase: (value: number) => value - 273.15,
    fromBase: (value: number) => value + 273.15
  }
}

const UNIT_PATTERN =
  /^\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s*([a-z\u4E00-\u9FA5°]+)(?:\s*(?:to|in|=|->)\s*([a-z\u4E00-\u9FA5°]+)\s*)?$/i

const CATEGORY_SUGGESTIONS: Record<string, string[]> = {
  length: ['m', 'ft', 'in', 'km'],
  mass: ['kg', 'lb', 't', 'g'],
  volume: ['l', 'ml', 'gal'],
  data: ['kb', 'mb', 'gb'],
  temperature: ['c', 'f', 'k']
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return value.toString()
  if (Math.abs(value) >= 1) {
    return Number(value.toFixed(4)).toString()
  }
  return Number(value.toPrecision(4)).toString()
}

export class UnitConversionAbility extends BasePreviewAbility {
  readonly id = 'preview.unit'
  readonly priority = 25

  override canHandle(query: { text?: string }): boolean {
    if (!query.text) return false
    return UNIT_PATTERN.test(query.text)
  }

  async execute(context: PreviewAbilityContext): Promise<PreviewAbilityResult | null> {
    const startedAt = performance.now()
    const text = this.getNormalizedQuery(context.query)
    const match = text.match(UNIT_PATTERN)
    if (!match) return null

    const [, rawValue, fromUnitRaw, toUnitRaw] = match
    const inputValue = Number(rawValue)
    if (Number.isNaN(inputValue)) return null

    const fromUnitKey = fromUnitRaw.toLowerCase()
    const fromUnit = UNIT_TABLE[fromUnitKey]
    if (!fromUnit) return null

    const toUnit = toUnitRaw ? UNIT_TABLE[toUnitRaw.toLowerCase()] : null
    if (toUnit && fromUnit.category !== toUnit.category) {
      return null
    }

    this.throwIfAborted(context.signal)
    const baseValue = fromUnit.toBase(inputValue)

    if (toUnit) {
      const converted = toUnit.fromBase(baseValue)
      const formattedResult = formatNumber(converted)

      const payload: PreviewCardPayload = {
        abilityId: this.id,
        title: text,
        subtitle: '单位换算',
        primaryLabel: `${fromUnit.display} → ${toUnit.display}`,
        primaryValue: formattedResult,
        secondaryLabel: '原值',
        secondaryValue: `${inputValue} ${fromUnitRaw}`,
        chips: [
          { label: fromUnit.display, value: `${inputValue} ${fromUnitRaw}` },
          { label: toUnit.display, value: `${formattedResult} ${toUnitRaw}` }
        ],
        sections: [
          {
            title: '详情',
            rows: [
              { label: '类别', value: fromUnit.category },
              { label: '公式', value: `${fromUnitRaw} → ${toUnitRaw}` }
            ]
          }
        ]
      }

      return {
        abilityId: this.id,
        confidence: 0.8,
        payload,
        durationMs: performance.now() - startedAt
      }
    }

    const suggestions =
      CATEGORY_SUGGESTIONS[fromUnit.category]?.filter((unit) => unit !== fromUnitKey) ?? []
    const rows = suggestions.slice(0, 3).map((targetKey) => {
      const target = UNIT_TABLE[targetKey]
      if (!target) return null
      const converted = target.fromBase(baseValue)
      return {
        label: `${fromUnit.display} → ${target.display}`,
        value: `${formatNumber(converted)} ${targetKey.toUpperCase()}`
      }
    })
    const filteredRows = rows.filter(Boolean) as { label: string; value: string }[]

    const payload: PreviewCardPayload = {
      abilityId: this.id,
      title: text,
      subtitle: '单位建议',
      primaryLabel: fromUnit.display,
      primaryValue: `${inputValue} ${fromUnitRaw}`,
      sections: filteredRows.length
        ? [
            {
              title: '常用换算',
              rows: filteredRows
            }
          ]
        : undefined
    }

    return {
      abilityId: this.id,
      confidence: 0.5,
      payload,
      durationMs: performance.now() - startedAt
    }
  }
}
