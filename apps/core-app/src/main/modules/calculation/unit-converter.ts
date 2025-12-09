import unitRegistry from './unit-registry.json'

type UnitCategory = keyof typeof unitRegistry

interface UnitDefinition {
  factor?: number
  type?: 'formula'
  toBase?: string
  fromBase?: string
  aliases: string[]
}

interface CategoryDefinition {
  base: string
  binary?: boolean
  units: Record<string, UnitDefinition>
}

export interface UnitConversionResult {
  success: boolean
  value?: number
  fromValue: number
  fromUnit: string
  toUnit: string
  category?: string
  formatted?: string
  error?: string
}

// Build alias lookup map
const aliasMap = new Map<string, { category: UnitCategory; unit: string }>()

for (const [category, def] of Object.entries(unitRegistry) as [UnitCategory, CategoryDefinition][]) {
  for (const [unit, unitDef] of Object.entries(def.units)) {
    // Add the unit itself
    aliasMap.set(unit.toLowerCase(), { category, unit })

    // Add all aliases
    for (const alias of unitDef.aliases) {
      aliasMap.set(alias.toLowerCase(), { category, unit })
    }
  }
}

function resolveUnit(input: string): { category: UnitCategory; unit: string } | null {
  const normalized = input.trim().toLowerCase()
  return aliasMap.get(normalized) ?? null
}

function evaluateFormula(formula: string, x: number): number {
  // Simple formula evaluator for temperature conversions
  // Handles: x, +, -, *, /, (, )
  const expr = formula.replace(/x/g, x.toString())
  // Using Function constructor for simple math (safe since formulas are from our JSON)
  return Function(`"use strict"; return (${expr})`)()
}

function convertToBase(value: number, unitDef: UnitDefinition): number {
  if (unitDef.type === 'formula' && unitDef.toBase) {
    return evaluateFormula(unitDef.toBase, value)
  }
  return value * (unitDef.factor ?? 1)
}

function convertFromBase(value: number, unitDef: UnitDefinition): number {
  if (unitDef.type === 'formula' && unitDef.fromBase) {
    return evaluateFormula(unitDef.fromBase, value)
  }
  return value / (unitDef.factor ?? 1)
}

export function convertUnit(value: number, fromUnit: string, toUnit: string): UnitConversionResult {
  const from = resolveUnit(fromUnit)
  const to = resolveUnit(toUnit)

  if (!from) {
    return {
      success: false,
      fromValue: value,
      fromUnit,
      toUnit,
      error: `Unknown unit: ${fromUnit}`,
    }
  }

  if (!to) {
    return {
      success: false,
      fromValue: value,
      fromUnit,
      toUnit,
      error: `Unknown unit: ${toUnit}`,
    }
  }

  if (from.category !== to.category) {
    return {
      success: false,
      fromValue: value,
      fromUnit,
      toUnit,
      error: `Cannot convert between ${from.category} and ${to.category}`,
    }
  }

  const categoryDef = unitRegistry[from.category] as CategoryDefinition
  const fromDef = categoryDef.units[from.unit] as UnitDefinition
  const toDef = categoryDef.units[to.unit] as UnitDefinition

  // Convert: from -> base -> to
  const baseValue = convertToBase(value, fromDef)
  const result = convertFromBase(baseValue, toDef)

  // Format result
  const rounded = Math.round(result * 1e10) / 1e10
  const formatted = `${value} ${from.unit} = ${rounded} ${to.unit}`

  return {
    success: true,
    value: rounded,
    fromValue: value,
    fromUnit: from.unit,
    toUnit: to.unit,
    category: from.category,
    formatted,
  }
}

// Pattern: "100 kg to lb" or "100kg=lb" or "100 千克 转 磅"
const UNIT_CONVERSION_PATTERN = /^([\d.]+)\s*([a-zA-Z\u4e00-\u9fa5°℃℉\/]+)\s*(?:to|in|=|->|转|换算|换成)\s*([a-zA-Z\u4e00-\u9fa5°℃℉\/]+)$/i

export function parseUnitConversion(query: string): UnitConversionResult | null {
  const match = query.trim().match(UNIT_CONVERSION_PATTERN)
  if (!match) {
    return null
  }

  const [, valueStr, fromUnit, toUnit] = match
  const value = parseFloat(valueStr)

  if (isNaN(value)) {
    return null
  }

  return convertUnit(value, fromUnit, toUnit)
}

export function looksLikeUnitConversion(query: string): boolean {
  return UNIT_CONVERSION_PATTERN.test(query.trim())
}

export function getAvailableCategories(): string[] {
  return Object.keys(unitRegistry)
}

export function getUnitsInCategory(category: string): string[] {
  const def = unitRegistry[category as UnitCategory]
  return def ? Object.keys(def.units) : []
}
