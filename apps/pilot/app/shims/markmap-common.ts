type AssetLike = string | { href?: string, src?: string }

const loadedStyleSet = new Set<string>()
const loadedScriptSet = new Set<string>()

type HookHandler = (...args: any[]) => void

export class Hook {
  private handlers: HookHandler[] = []

  tap(handler: HookHandler): () => void {
    if (typeof handler !== 'function') {
      return () => {}
    }
    this.handlers.push(handler)
    return () => {
      const index = this.handlers.indexOf(handler)
      if (index >= 0) {
        this.handlers.splice(index, 1)
      }
    }
  }

  call(...args: any[]): void {
    const list = [...this.handlers]
    for (const handler of list) {
      handler(...args)
    }
  }
}

export class UrlBuilder {
  private baseUrl = ''

  setBase(baseUrl: string): void {
    this.baseUrl = String(baseUrl || '').trim()
  }

  getFullUrl(input: string): string {
    const raw = String(input || '').trim()
    if (!raw) {
      return ''
    }
    if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('/')) {
      return raw
    }
    if (!this.baseUrl) {
      return raw
    }
    try {
      return new URL(raw, this.baseUrl).toString()
    }
    catch {
      return raw
    }
  }
}

export function getId(prefix = 'markmap'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 0): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, Math.max(0, Number(wait) || 0))
  }
}

export function addClass(current: string | null | undefined, ...tokens: Array<string | null | undefined>): string {
  const set = new Set(
    String(current || '')
      .split(/\s+/)
      .map(item => item.trim())
      .filter(Boolean),
  )
  for (const token of tokens) {
    const normalized = String(token || '').trim()
    if (normalized) {
      set.add(normalized)
    }
  }
  return [...set].join(' ')
}

export function walkTree(
  root: any,
  visitor: (node: any, next: () => void, parent: any | null) => void,
): any {
  const visit = (node: any, parent: any | null) => {
    if (!node || typeof node !== 'object') {
      return
    }
    let proceeded = false
    const next = () => {
      if (proceeded) {
        return
      }
      proceeded = true
      const children = Array.isArray(node.children) ? node.children : []
      for (const child of children) {
        visit(child, node)
      }
    }
    visitor(node, next, parent)
  }
  visit(root, null)
  return root
}

export function childSelector(selector: string): string {
  const normalized = String(selector || '').trim()
  if (!normalized) {
    return ':scope > *'
  }
  return `:scope > ${normalized}`
}

export function noop(): void {}

function normalizeAssets(assets: unknown): AssetLike[] {
  if (!Array.isArray(assets)) {
    return []
  }
  return assets.filter(asset => typeof asset === 'string' || (asset !== null && typeof asset === 'object')) as AssetLike[]
}

function resolveAssetUrl(asset: AssetLike): string {
  if (typeof asset === 'string') {
    return asset
  }
  if (typeof asset.href === 'string' && asset.href) {
    return asset.href
  }
  if (typeof asset.src === 'string' && asset.src) {
    return asset.src
  }
  return ''
}

export function loadCSS(styles: unknown) {
  if (typeof document === 'undefined') {
    return
  }

  for (const asset of normalizeAssets(styles)) {
    const href = resolveAssetUrl(asset)
    if (!href || loadedStyleSet.has(href)) {
      continue
    }

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    document.head.appendChild(link)
    loadedStyleSet.add(href)
  }
}

export async function loadJS(scripts: unknown) {
  if (typeof document === 'undefined') {
    return
  }

  for (const asset of normalizeAssets(scripts)) {
    const src = resolveAssetUrl(asset)
    if (!src || loadedScriptSet.has(src)) {
      continue
    }

    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.async = true
      script.src = src
      script.onload = () => resolve()
      script.onerror = () => reject(new Error(`Failed to load script asset: ${src}`))
      document.head.appendChild(script)
    })
    loadedScriptSet.add(src)
  }
}
