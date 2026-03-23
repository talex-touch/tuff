import type { DownloadAsset } from '@talex-touch/utils'

export type SupportedUpdatePlatform = DownloadAsset['platform']
export type SupportedUpdateArch = DownloadAsset['arch']
export type UpdatePlatform = SupportedUpdatePlatform | 'unsupported'
export type UpdateArch = SupportedUpdateArch | 'unsupported'

export interface UpdateAssetTarget {
  platform: SupportedUpdatePlatform
  arch: SupportedUpdateArch
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase().trim() : ''
}

function detectPlatformByText(text: string): UpdatePlatform {
  if (!text) return 'unsupported'
  if (text.includes('win') || text.includes('windows') || text.includes('.exe')) return 'win32'
  if (text.includes('darwin') || text.includes('mac') || text.includes('.dmg')) return 'darwin'
  if (
    text.includes('linux') ||
    text.includes('ubuntu') ||
    text.includes('debian') ||
    text.includes('.deb') ||
    text.includes('.rpm') ||
    text.includes('.appimage')
  ) {
    return 'linux'
  }
  return 'unsupported'
}

function detectArchByText(text: string): UpdateArch {
  if (!text) return 'unsupported'
  if (text.includes('arm64') || text.includes('aarch64')) return 'arm64'
  if (text.includes('x64') || text.includes('amd64') || text.includes('x86_64')) return 'x64'
  return 'unsupported'
}

export function resolveRuntimeUpdatePlatform(runtimePlatform = process.platform): UpdatePlatform {
  switch (runtimePlatform) {
    case 'win32':
      return 'win32'
    case 'darwin':
      return 'darwin'
    case 'linux':
      return 'linux'
    default:
      return 'unsupported'
  }
}

export function resolveRuntimeUpdateArch(runtimeArch = process.arch): UpdateArch {
  switch (runtimeArch) {
    case 'x64':
      return 'x64'
    case 'arm64':
      return 'arm64'
    default:
      return 'unsupported'
  }
}

export function detectUpdateAssetPlatform(
  filename: string,
  hintedPlatform?: unknown
): UpdatePlatform {
  const fromHint = detectPlatformByText(normalizeText(hintedPlatform))
  if (fromHint !== 'unsupported') {
    return fromHint
  }
  return detectPlatformByText(filename.toLowerCase())
}

export function detectUpdateAssetArch(filename: string, hintedArch?: unknown): UpdateArch {
  const fromHint = detectArchByText(normalizeText(hintedArch))
  if (fromHint !== 'unsupported') {
    return fromHint
  }
  return detectArchByText(filename.toLowerCase())
}

export function resolveUpdateAssetTarget(
  filename: string,
  hints: { platform?: unknown; arch?: unknown } = {}
): UpdateAssetTarget | null {
  const platform = detectUpdateAssetPlatform(filename, hints.platform)
  const arch = detectUpdateAssetArch(filename, hints.arch)
  if (platform === 'unsupported' || arch === 'unsupported') {
    return null
  }
  return { platform, arch }
}
