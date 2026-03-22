import type { RenderResult } from 'mermaid'

export type MermaidRenderErrorCode = 'E_MERMAID_ESM_EXPORT'
  | 'E_MERMAID_DOMPURIFY'
  | 'E_MERMAID_PARSE'
  | 'E_MERMAID_RENDER'

interface MermaidRenderOptions {
  idPrefix?: string
  isStale?: () => boolean
  initializeConfig?: Record<string, unknown>
}

let mermaidRuntimePromise: Promise<typeof import('mermaid').default> | null = null
let mermaidRenderIndex = 0

export function resolveMermaidErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === 'string') {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Unknown error'
}

export function resolveMermaidErrorCode(message: string): MermaidRenderErrorCode {
  const normalized = message.toLowerCase()
  if (normalized.includes('does not provide an export named')) {
    return 'E_MERMAID_ESM_EXPORT'
  }
  if (normalized.includes('dompurify.sanitize')) {
    return 'E_MERMAID_DOMPURIFY'
  }
  if (normalized.includes('parse error') || normalized.includes('syntaxerror')) {
    return 'E_MERMAID_PARSE'
  }
  return 'E_MERMAID_RENDER'
}

export function reportMermaidError(scope: string, error: unknown) {
  if (!import.meta.dev) {
    return
  }

  const message = resolveMermaidErrorMessage(error)
  console.warn(`[${scope}] Mermaid render failed`, {
    code: resolveMermaidErrorCode(message),
    message,
  })
}

async function resolveMermaidRuntime(initializeConfig: Record<string, unknown> = {}) {
  if (!mermaidRuntimePromise) {
    mermaidRuntimePromise = import('mermaid').then((mod) => {
      const runtime = mod.default
      runtime.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        ...initializeConfig,
      })
      return runtime
    })
  }
  return mermaidRuntimePromise
}

export async function renderMermaidSvg(
  source: string,
  options: MermaidRenderOptions = {},
): Promise<RenderResult | null> {
  const runtime = await resolveMermaidRuntime(options.initializeConfig)

  if (options.isStale?.()) {
    return null
  }

  mermaidRenderIndex += 1
  const renderId = `${options.idPrefix || 'mermaid-render'}-${Date.now()}-${mermaidRenderIndex}`
  const result = await runtime.render(renderId, source)

  if (options.isStale?.()) {
    return null
  }

  return result
}
