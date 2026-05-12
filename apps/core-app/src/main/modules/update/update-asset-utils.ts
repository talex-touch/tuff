import type { UpdateArtifactComponent } from '@talex-touch/utils'
import { UPDATE_RELEASE_MANIFEST_NAME } from '@talex-touch/utils'

export interface UpdateAssetScoreInput {
  component?: UpdateArtifactComponent
}

export function calculateUpdateAssetScore(
  filename: string,
  asset: UpdateAssetScoreInput,
  platform: string
): number {
  let score = 0

  if (asset.component === 'core') {
    score += 200
  }

  if (filename.includes('tuff')) {
    score += 20
  }

  if (filename.includes('latest-release')) {
    score += 10
  }

  score += getInstallerExtensionScore(filename, platform)

  return score
}

export function getInstallerExtensionScore(filename: string, platform: string): number {
  if (platform === 'darwin') {
    if (filename.endsWith('.app.zip')) return 180
    if (filename.endsWith('.dmg')) return 140
    if (filename.endsWith('.pkg')) return 130
    if (filename.endsWith('.zip')) return 90
    return 0
  }

  if (platform === 'win32') {
    if (filename.endsWith('.exe')) return 140
    if (filename.endsWith('.msi')) return 130
    if (filename.endsWith('.zip')) return 90
    if (filename.endsWith('.7z')) return 80
    return 0
  }

  if (filename.endsWith('.appimage')) return 140
  if (filename.endsWith('.deb')) return 130
  if (filename.endsWith('.rpm')) return 120
  if (filename.endsWith('.tar.gz') || filename.endsWith('.tgz')) return 100
  if (filename.endsWith('.zip')) return 80
  return 0
}

export function isUpdateManifestAsset(filename: string): boolean {
  return normalizeUpdateAssetKey(filename) === UPDATE_RELEASE_MANIFEST_NAME
}

export function isUpdateMetadataAsset(filename: string): boolean {
  const lower = filename.toLowerCase()

  return (
    lower.endsWith('.yml') ||
    lower.endsWith('.yaml') ||
    lower.endsWith('.json') ||
    lower.endsWith('.blockmap') ||
    lower.includes('builder-debug')
  )
}

export function isAuxiliaryUpdateComponentAsset(filename: string): boolean {
  return (
    filename.includes('renderer') ||
    filename.includes('extensions') ||
    filename.includes('extension')
  )
}

export function isUpdateSignatureAsset(filename: string): boolean {
  const lower = filename.toLowerCase()
  return lower.endsWith('.sig') || lower.endsWith('.sig.txt') || lower.endsWith('.asc')
}

export function stripUpdateSignatureSuffix(filename: string): string {
  return filename.replace(/\.(sig|asc)(\.txt)?$/i, '')
}

export function isUpdateChecksumAsset(filename: string): boolean {
  const lower = filename.toLowerCase()
  return (
    lower.endsWith('.sha256') ||
    lower.endsWith('.sha1') ||
    lower.endsWith('.md5') ||
    lower.endsWith('.sha256.txt') ||
    lower.endsWith('.sha1.txt') ||
    lower.endsWith('.md5.txt') ||
    lower.endsWith('.sha256sum') ||
    lower.endsWith('.sha1sum') ||
    lower.endsWith('.md5sum')
  )
}

export function normalizeUpdateAssetKey(filename: string): string {
  return filename.toLowerCase()
}
