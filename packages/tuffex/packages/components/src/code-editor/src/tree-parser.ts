import type { CodeEditorLanguage } from './types'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export type TreePrimitive = string | number | boolean | null
export type TreeValue = TreePrimitive | TreeValue[] | { [key: string]: TreeValue }

export interface TreeParseResult {
  ok: boolean
  value?: TreeValue
  error?: string
  editable: boolean
}

const CSS_NAMED_COLORS = new Set([
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
  'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
  'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan',
  'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta',
  'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
  'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink',
  'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen',
  'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow',
  'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
  'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan',
  'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon',
  'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue',
  'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine',
  'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue',
  'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream',
  'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange',
  'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred',
  'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple',
  'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen',
  'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow',
  'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet',
  'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen',
])

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FUNC_COLOR_RE = /^(?:rgba?|hsla?|oklch|oklab|lab|lch)\(\s*[^)]+\)$/i

export function isCssColorValue(value: unknown): value is string {
  if (typeof value !== 'string')
    return false
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 48)
    return false
  if (HEX_COLOR_RE.test(trimmed) || FUNC_COLOR_RE.test(trimmed))
    return true
  return CSS_NAMED_COLORS.has(trimmed.toLowerCase())
}

function parseScalar(raw: string): TreeValue {
  const trimmed = raw.trim()
  if (!trimmed)
    return ''
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\'')))
    return trimmed.slice(1, -1)
  if (trimmed === 'true')
    return true
  if (trimmed === 'false')
    return false
  if (trimmed === 'null' || trimmed === '~')
    return null
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed))
    return Number(trimmed)
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim()
    if (!inner)
      return []
    return inner.split(',').map(part => parseScalar(part))
  }
  return trimmed
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function parseKeyValueConfig(source: string): Record<string, TreeValue> {
  const root: Record<string, TreeValue> = Object.create(null) as Record<string, TreeValue>
  let target: Record<string, TreeValue> = root

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';'))
      continue
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/)
    if (sectionMatch?.[1]) {
      const sectionName = sectionMatch[1].trim()
      if (!sectionName || UNSAFE_KEYS.has(sectionName))
        continue
      const existing = Object.prototype.hasOwnProperty.call(root, sectionName) ? root[sectionName] : undefined
      if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
        target = existing
      }
      else {
        const next: Record<string, TreeValue> = Object.create(null) as Record<string, TreeValue>
        root[sectionName] = next
        target = next
      }
      continue
    }
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim()
      const rawVal = trimmed.slice(eqIndex + 1).trim()
      if (key && !UNSAFE_KEYS.has(key))
        target[key] = parseScalar(rawVal)
    }
  }

  return root
}

export function isStructuredLanguage(language: CodeEditorLanguage | undefined): boolean {
  return language === 'json' || language === 'yaml' || language === 'toml' || language === 'ini'
}

export function parseStructuredValue(source: string, language: CodeEditorLanguage): TreeParseResult {
  const trimmed = source.trim()
  if (!trimmed)
    return { ok: true, value: {}, editable: language === 'json' || language === 'yaml' }

  try {
    if (language === 'json') {
      const parsed = JSON.parse(trimmed) as TreeValue
      return { ok: true, value: parsed, editable: true }
    }
    if (language === 'yaml') {
      const parsed = parseYaml(trimmed) as TreeValue
      return { ok: true, value: parsed ?? null, editable: true }
    }
    if (language === 'toml' || language === 'ini') {
      return { ok: true, value: parseKeyValueConfig(source), editable: false }
    }
    return { ok: false, error: `Tree preview is not supported for ${language}.`, editable: false }
  }
  catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to parse structured content.',
      editable: false,
    }
  }
}

export function setValueAtPath(root: TreeValue, path: (string | number)[], nextValue: TreeValue): TreeValue {
  if (path.length === 0)
    return nextValue

  const [head, ...rest] = path
  if (Array.isArray(root) && typeof head === 'number') {
    const copy = [...root]
    copy[head] = setValueAtPath(copy[head] ?? null, rest, nextValue)
    return copy
  }
  if (root && typeof root === 'object' && !Array.isArray(root) && typeof head === 'string' && !UNSAFE_KEYS.has(head)) {
    const current = Object.prototype.hasOwnProperty.call(root, head) ? root[head] : null
    return {
      ...root,
      [head]: setValueAtPath(current ?? null, rest, nextValue),
    }
  }
  return root
}

export function serializeStructuredValue(value: TreeValue, language: CodeEditorLanguage, tabSize = 2): string | null {
  try {
    if (language === 'json')
      return JSON.stringify(value, null, tabSize)
    if (language === 'yaml')
      return stringifyYaml(value, { indent: tabSize }).trimEnd()
    return null
  }
  catch {
    return null
  }
}
