import type { ReadyComponentId } from '../tuffex-framework-matrix'

export type ShowcaseLocale = 'zh' | 'en'

export interface ReactModuleLike {
  createElement: (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown
  Fragment: unknown
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void]
}

export interface FrameworkShowcaseDefinition {
  id: ReadyComponentId
  wcTag: string
  wcCode: (locale: ShowcaseLocale) => string
  reactCode: (locale: ShowcaseLocale) => string
  mountWc: (container: HTMLElement, locale: ShowcaseLocale) => () => void
  renderReact: (
    React: ReactModuleLike,
    TuffexReact: Record<string, unknown>,
    locale: ShowcaseLocale,
  ) => unknown
}

export type ElAttrs = Record<string, string | number | boolean | undefined>
export type ElProps = Record<string, unknown>

export function createWcEl(
  tag: string,
  options: {
    attrs?: ElAttrs
    props?: ElProps
    text?: string
    children?: Node[]
    events?: Record<string, EventListener>
    style?: Partial<CSSStyleDeclaration>
    className?: string
  } = {},
  disposers?: Array<() => void>,
): HTMLElement {
  const el = document.createElement(tag)
  if (options.className)
    el.className = options.className
  if (options.style)
    Object.assign(el.style, options.style)
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      if (value === undefined || value === false)
        continue
      el.setAttribute(key, value === true ? '' : String(value))
    }
  }
  if (options.props) {
    for (const [key, value] of Object.entries(options.props))
      (el as unknown as Record<string, unknown>)[key] = value
  }
  if (options.text !== undefined)
    el.textContent = options.text
  if (options.children) {
    for (const child of options.children)
      el.appendChild(child)
  }
  if (options.events) {
    for (const [eventName, handler] of Object.entries(options.events)) {
      el.addEventListener(eventName, handler)
      disposers?.push(() => el.removeEventListener(eventName, handler))
    }
  }
  return el
}

export function createStageRow(children: Node[], vertical = false): HTMLDivElement {
  const row = document.createElement('div')
  row.className = vertical ? 'tuff-fw-stage__stack' : 'tuff-fw-stage__row'
  for (const child of children)
    row.appendChild(child)
  return row
}

export function createStatusReadout(initialText: string): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = 'tuff-fw-stage__readout'
  span.textContent = initialText
  return span
}

export function createBoxEl(text: string, extraStyle?: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement('div')
  el.textContent = text
  Object.assign(el.style, {
    padding: '8px 12px',
    borderRadius: '8px',
    background: 'var(--tx-fill-color-light, #f5f7fa)',
    border: '1px solid var(--tx-border-color-lighter, #ebeef5)',
    fontSize: '12px',
    ...extraStyle,
  })
  return el
}

export function pickReactComponent(TuffexReact: Record<string, unknown>, name: string): unknown {
  return TuffexReact[name] ?? TuffexReact.default ?? 'div'
}

export function unpackDetail<T = unknown>(event: Event): T {
  const detail = (event as CustomEvent).detail
  return (Array.isArray(detail) ? detail[0] : detail) as T
}

export function disposeAll(disposers: Array<() => void>): () => void {
  return () => {
    for (const dispose of disposers)
      dispose()
  }
}

export const DEMO_BOX_STYLE = {
  padding: '8px 12px',
  borderRadius: '8px',
  background: 'var(--tx-fill-color-light, #f5f7fa)',
  border: '1px solid var(--tx-border-color-lighter, #ebeef5)',
  fontSize: '12px',
} as const
