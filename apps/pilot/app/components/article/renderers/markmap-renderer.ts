import { loadCSS, loadJS } from 'markmap-common'
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
      Promise.resolve(loadCSS(assets.styles)),
      Promise.resolve(loadJS(assets.scripts)),
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
    instance.fit()
    instance.zoom(0)
  }

  const fit = () => {
    instance.fit()
  }

  const resetZoom = () => {
    instance.fit()
    instance.zoom(0)
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
