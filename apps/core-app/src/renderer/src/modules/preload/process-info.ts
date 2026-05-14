import { hasWindow } from '@talex-touch/utils/env'

export interface RendererPreloadProcessInfo {
  arch: string
  platform: string
  versions: Partial<NodeJS.ProcessVersions>
}

type PreloadApiWithProcessInfo = Window['api'] & {
  getProcessInfo?: () => RendererPreloadProcessInfo
}

export function getPreloadProcessInfo(): RendererPreloadProcessInfo | null {
  if (!hasWindow()) return null
  const api = window.api as PreloadApiWithProcessInfo | undefined
  return api?.getProcessInfo?.() ?? null
}
