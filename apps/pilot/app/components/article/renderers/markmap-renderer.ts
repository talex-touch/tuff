import { Transformer } from 'markmap-lib'
import { Markmap } from 'markmap-view'

export type MarkmapRenderErrorCode = 'E_MARKMAP_ASSET'
  | 'E_MARKMAP_RENDER'

export interface MarkmapRenderer {
  instance: Markmap
  update: (markdown: string) => void
  fit: () => void
  resetZoom: () => void
  destroy: () => void
}

const transformer = new Transformer()
let markmapAssetsPromise: Promise<void> | null = null

interface MarkmapAssetData {
  href?: string
  src?: string
}

interface MarkmapAssetItem {
  type?: string
  data?: MarkmapAssetData
}

export function resolveMarkmapErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === 'string') {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Unknown error'
}

export function resolveMarkmapErrorCode(message: string): MarkmapRenderErrorCode {
  const normalized = message.toLowerCase()
  if (normalized.includes('script') || normalized.includes('style') || normalized.includes('asset')) {
    return 'E_MARKMAP_ASSET'
  }
  return 'E_MARKMAP_RENDER'
}

export function reportMarkmapError(scope: string, error: unknown) {
  if (!import.meta.dev) {
    return
  }

  const message = resolveMarkmapErrorMessage(error)
  console.warn(`[${scope}] Markmap render failed`, {
    code: resolveMarkmapErrorCode(message),
    message,
  })
}

async function ensureMarkmapAssets() {
  if (!markmapAssetsPromise) {
    const assets = transformer.getAssets()
    markmapAssetsPromise = Promise.all([
      loadMarkmapStyles(assets.styles as MarkmapAssetItem[] | undefined),
      loadMarkmapScripts(assets.scripts as MarkmapAssetItem[] | undefined),
    ])
      .then(() => undefined)
      .catch((error) => {
        markmapAssetsPromise = null
        throw error
      })
  }
  return markmapAssetsPromise
}

export async function createMarkmapRenderer(target: SVGSVGElement): Promise<MarkmapRenderer> {
  await ensureMarkmapAssets()
  const instance = Markmap.create(target)

  const update = (markdown: string) => {
    const { root } = transformer.transform(markdown || '')
    instance.setData(root)
    void instance.fit()
    void instance.rescale(1)
  }

  const fit = () => {
    void instance.fit()
  }

  const resetZoom = () => {
    void instance.fit()
    void instance.rescale(1)
  }

  const destroy = () => {
    try {
      ;(instance as { destroy?: () => void }).destroy?.()
    }
    finally {
      target.replaceChildren()
    }
  }

  return {
    instance,
    update,
    fit,
    resetZoom,
    destroy,
  }
}

function loadMarkmapStyles(items: MarkmapAssetItem[] = []): Promise<void> {
  if (!import.meta.client) {
    return Promise.resolve()
  }

  for (const item of items) {
    const href = String(item?.data?.href || '').trim()
    if (!href) {
      continue
    }

    const selector = `link[data-markmap-style="${CSS.escape(href)}"]`
    if (document.head.querySelector(selector)) {
      continue
    }

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.dataset.markmapStyle = href
    document.head.appendChild(link)
  }

  return Promise.resolve()
}

function loadMarkmapScripts(items: MarkmapAssetItem[] = []): Promise<void> {
  if (!import.meta.client) {
    return Promise.resolve()
  }

  return Promise.all(items.map((item) => {
    const src = String(item?.data?.src || '').trim()
    if (!src) {
      return Promise.resolve()
    }

    const selector = `script[data-markmap-script="${CSS.escape(src)}"]`
    const existing = document.head.querySelector<HTMLScriptElement>(selector)
    if (existing?.dataset.loaded === 'true') {
      return Promise.resolve()
    }

    if (existing) {
      return new Promise<void>((resolve, reject) => {
        existing.addEventListener('load', () => resolve(), { once: true })
        existing.addEventListener('error', event => reject(event), { once: true })
      })
    }

    return new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = src
      script.async = true
      script.dataset.markmapScript = src
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true'
        resolve()
      }, { once: true })
      script.addEventListener('error', event => reject(event), { once: true })
      document.head.appendChild(script)
    })
  })).then(() => undefined)
}
