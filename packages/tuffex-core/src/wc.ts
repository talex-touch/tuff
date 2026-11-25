import { hasDocument, hasWindow } from './utils/env'

/** Convert `camelCase` prop name to `kebab-case` HTML attribute name. */
export function camelToKebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/** Convert `kebab-case` HTML attribute name to `camelCase` prop name. */
export function kebabToCamel(value: string): string {
  return value.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase())
}

/**
 * Coerce HTML attribute/property value to boolean following HTML boolean-attribute rules
 * (`""`, `"true"`, `"1"` -> `true`; `null`, `"false"`, `"0"` -> `false`).
 */
export function coerceBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null)
    return fallback
  if (typeof value === 'boolean')
    return value
  if (typeof value === 'number')
    return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === '' || normalized === 'true' || normalized === '1')
      return true
    if (normalized === 'false' || normalized === '0')
      return false
  }
  return Boolean(value)
}

/** Coerce HTML attribute/property value to a finite number, falling back when unparseable. */
export function coerceNumber(value: unknown, fallback?: number): number | undefined {
  if (value === undefined || value === null || value === '')
    return fallback
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** Coerce HTML attribute/property value to string. */
export function coerceString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null)
    return fallback
  return String(value)
}

/** Coerce a JSON string attribute or direct JS value into a typed object/array. */
export function coerceJson<T>(value: unknown, fallback: T): T {
  if (value === undefined || value === null || value === '')
    return fallback
  if (typeof value !== 'string')
    return value as T
  try {
    return JSON.parse(value) as T
  }
  catch {
    return fallback
  }
}

/** Coerce a JSON array string or direct array value into `T[]`. */
export function coerceArray<T = unknown>(value: unknown, fallback: T[] = []): T[] {
  if (Array.isArray(value))
    return value as T[]
  const parsed = coerceJson<unknown>(value, fallback)
  return Array.isArray(parsed) ? (parsed as T[]) : fallback
}

export type AttrCoercionKind = 'string' | 'boolean' | 'number' | 'json' | 'array'

/** Parse an HTML attribute string according to its declared property type. */
export function parseAttrValue(value: string | null, kind: AttrCoercionKind): unknown {
  switch (kind) {
    case 'boolean':
      return coerceBoolean(value, false)
    case 'number':
      return coerceNumber(value)
    case 'json':
      return coerceJson(value, undefined)
    case 'array':
      return coerceArray(value, [])
    case 'string':
    default:
      return value ?? undefined
  }
}

/** Reflect a JS property value back to an HTML attribute cleanly. */
export function reflectAttribute(el: Element, attrName: string, value: unknown): void {
  if (value === undefined || value === null || value === false) {
    el.removeAttribute(attrName)
    return
  }
  if (value === true) {
    el.setAttribute(attrName, '')
    return
  }
  el.setAttribute(attrName, typeof value === 'object' ? JSON.stringify(value) : String(value))
}

export interface CustomEventDispatchOptions {
  /** @default true */
  bubbles?: boolean
  /** @default true */
  composed?: boolean
  /** @default false */
  cancelable?: boolean
}

/**
 * Dispatch a Shadow-DOM-crossing `CustomEvent` (`bubbles: true, composed: true` by default).
 * Returns `false` if the event is cancelable and a listener called `preventDefault()`.
 */
export function dispatchCustomEvent<T = unknown>(
  target: EventTarget,
  eventName: string,
  detail?: T,
  options: CustomEventDispatchOptions = {},
): boolean {
  const event = new CustomEvent<T>(eventName, {
    detail,
    bubbles: options.bubbles ?? true,
    composed: options.composed ?? true,
    cancelable: options.cancelable ?? false,
  })
  return target.dispatchEvent(event)
}

const sheetCache = new Map<string, CSSStyleSheet>()

function supportsConstructableStyleSheets(): boolean {
  return hasWindow()
    && typeof CSSStyleSheet === 'function'
    && typeof CSSStyleSheet.prototype.replaceSync === 'function'
}

/**
 * Creates or returns a cached constructable `CSSStyleSheet` so multiple Web Component
 * instances share a single parsed stylesheet via `adoptedStyleSheets`.
 * Returns `null` in environments without Constructable Stylesheets (e.g., jsdom).
 */
export function createSharedStyleSheet(cssText: string, cacheKey?: string): CSSStyleSheet | null {
  if (!supportsConstructableStyleSheets())
    return null
  const key = cacheKey ?? cssText
  const existing = sheetCache.get(key)
  if (existing)
    return existing
  try {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(cssText)
    sheetCache.set(key, sheet)
    return sheet
  }
  catch {
    return null
  }
}

/**
 * Adopts CSS text or `CSSStyleSheet` entries into a `ShadowRoot` or `Document`.
 * Uses `adoptedStyleSheets` when supported and falls back to deduplicated `<style>` nodes otherwise.
 */
export function adoptStyles(
  root: ShadowRoot | Document,
  styles: Array<string | CSSStyleSheet>,
  markerPrefix = 'tx-shared-style',
): void {
  const resolvedSheets: CSSStyleSheet[] = []
  const fallbackTexts: Array<{ key: string, css: string }> = []

  styles.forEach((entry, index) => {
    if (typeof entry === 'string') {
      const sheet = createSharedStyleSheet(entry)
      if (sheet)
        resolvedSheets.push(sheet)
      else
        fallbackTexts.push({ key: `${markerPrefix}-${index}`, css: entry })
    }
    else {
      resolvedSheets.push(entry)
    }
  })

  if (resolvedSheets.length > 0 && 'adoptedStyleSheets' in root) {
    try {
      const current = Array.from(root.adoptedStyleSheets ?? [])
      const additions = resolvedSheets.filter(sheet => !current.includes(sheet))
      if (additions.length > 0)
        root.adoptedStyleSheets = [...current, ...additions]
    }
    catch {
      // Fall through to <style> injection when adoptedStyleSheets is read-only.
      styles.forEach((entry, index) => {
        if (typeof entry === 'string')
          fallbackTexts.push({ key: `${markerPrefix}-${index}`, css: entry })
      })
    }
  }

  if (fallbackTexts.length > 0 && hasDocument()) {
    const doc = 'head' in root ? root : root.ownerDocument
    const container = 'head' in root ? root.head : root
    if (!doc || !container)
      return

    for (const item of fallbackTexts) {
      const existing = container.querySelector(`style[data-tx-style="${item.key}"]`)
      if (existing)
        continue
      const styleEl = doc.createElement('style')
      styleEl.setAttribute('data-tx-style', item.key)
      styleEl.textContent = item.css
      container.appendChild(styleEl)
    }
  }
}

export function clearStyleSheetCache(): void {
  sheetCache.clear()
}

/** Idempotent `customElements.define` helper safe for HMR and duplicate bundle loads. */
export function defineElementSafe(
  tagName: string,
  ctor: CustomElementConstructor,
  options?: ElementDefinitionOptions,
): boolean {
  if (!hasWindow() || typeof customElements === 'undefined')
    return false
  if (customElements.get(tagName))
    return false
  customElements.define(tagName, ctor, options)
  return true
}
