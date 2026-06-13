import type { TxIconConfig } from '@talex-touch/tuffex/icon'
import { toTfileUrl } from '@talex-touch/utils/network'
import { useSvgContent } from '~/modules/hooks/useSvgContent'

function normalizeIconSource(source: string): string {
  const raw = source.trim()
  if (raw.startsWith('i-/api/')) return raw.slice(2)
  return raw
}

function isWindowsAbsolutePath(source: string): boolean {
  return /^[a-z]:[\\/]/i.test(source)
}

function isLocalFileSource(source: string): boolean {
  if (!source) return false
  if (source.startsWith('file:') || source.startsWith('tfile:')) return true
  if (source.startsWith('\\\\')) return true
  if (isWindowsAbsolutePath(source)) return true
  return source.startsWith('/') && !source.startsWith('/api/')
}

export function resolveCoreAppIconUrl(source: string, type: 'url' | 'file'): string {
  const normalized = normalizeIconSource(source)
  if (!normalized) return ''
  if (type === 'file') {
    return toTfileUrl(normalized)
  }
  if (isLocalFileSource(normalized)) {
    return toTfileUrl(normalized)
  }
  return normalized
}

export async function fetchCoreAppSvgContent(url: string): Promise<string> {
  const { content, error, fetchSvgContent, setUrl } = useSvgContent('', false)
  setUrl(url)
  await fetchSvgContent()
  if (error.value) {
    throw error.value
  }
  return content.value ?? ''
}

export function createCoreAppIconConfig(): TxIconConfig {
  return {
    fileProtocol: 'tfile://',
    urlResolver: resolveCoreAppIconUrl,
    svgFetcher: fetchCoreAppSvgContent
  }
}
