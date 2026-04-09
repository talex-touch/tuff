import type { DownloadAsset } from '@talex-touch/utils'

export type SupportedUpdatePlatform = DownloadAsset['platform']
export type SupportedUpdateArch = DownloadAsset['arch']
export type UpdatePlatform = SupportedUpdatePlatform | 'unsupported'
export type UpdateArch = SupportedUpdateArch | 'unsupported'
export type DetectedUpdateAssetArch = SupportedUpdateArch | 'universal' | 'generic' | 'unsupported'

export interface UpdateAssetTarget {
  platform: SupportedUpdatePlatform
  arch: SupportedUpdateArch
  sourceArch: Exclude<DetectedUpdateAssetArch, 'unsupported'>
  priority: 3 | 2 | 1
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase().trim() : ''
}

function detectPlatformByText(text: string): UpdatePlatform {
  if (!text) return 'unsupported'
  if (text.includes('darwin') || text.includes('mac') || text.includes('.dmg')) return 'darwin'
  if (
    text.includes('windows') ||
    text.includes('.exe') ||
    /(^|[^a-z])win(32|64)?([^a-z]|$)/.test(text)
  ) {
    return 'win32'
  }
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

function detectArchByText(text: string): DetectedUpdateAssetArch {
  if (!text) return 'generic'
  if (
    text.includes('universal') ||
    text.includes('fat') ||
    text.includes('all-arch') ||
    text.includes('all_arch')
  ) {
    return 'universal'
  }
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
  const hintedText = normalizeText(hintedPlatform)
  const fromHint = detectPlatformByText(hintedText)
  if (hintedText && fromHint === 'unsupported') {
    return 'unsupported'
  }
  if (fromHint !== 'unsupported') {
    return fromHint
  }
  return detectPlatformByText(filename.toLowerCase())
}

export function detectUpdateAssetArch(
  filename: string,
  hintedArch?: unknown
): DetectedUpdateAssetArch {
  const hintedText = normalizeText(hintedArch)
  const fromHint = detectArchByText(hintedText)
  if (hintedText) {
    return fromHint
  }

  const fromFilename = detectArchByText(filename.toLowerCase())
  return fromFilename === 'unsupported' ? 'generic' : fromFilename
}

export function resolveUpdateAssetTarget(
  filename: string,
  hints: { platform?: unknown; arch?: unknown } = {},
  runtime: { platform?: NodeJS.Platform; arch?: NodeJS.Architecture } = {}
): UpdateAssetTarget | null {
  const platform = detectUpdateAssetPlatform(filename, hints.platform)
  const sourceArch = detectUpdateAssetArch(filename, hints.arch)

  if (platform === 'unsupported' || sourceArch === 'unsupported') {
    return null
  }

  const runtimeArch = resolveRuntimeUpdateArch(runtime.arch)
  const needsRuntimeArch = sourceArch === 'universal' || sourceArch === 'generic'
  if (needsRuntimeArch && runtimeArch === 'unsupported') {
    return null
  }

  if (sourceArch !== 'arm64' && sourceArch !== 'x64' && runtimeArch === 'unsupported') {
    return null
  }

  if (sourceArch === 'arm64' || sourceArch === 'x64') {
    return {
      platform,
      arch: sourceArch,
      sourceArch,
      priority: 3
    }
  }

  const normalizedRuntimeArch =
    runtimeArch === 'arm64' || runtimeArch === 'x64' ? runtimeArch : null
  if (!normalizedRuntimeArch) {
    return null
  }

  return {
    platform,
    arch: normalizedRuntimeArch,
    sourceArch,
    priority: sourceArch === 'universal' ? 2 : 1
  }
}

export function compareUpdateAssetTargets(
  left: UpdateAssetTarget,
  right: UpdateAssetTarget
): number {
  return right.priority - left.priority
}
