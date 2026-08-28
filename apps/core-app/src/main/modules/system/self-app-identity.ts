import process from 'node:process'

const SELF_BUNDLE_IDS = new Set(['com.tagzxia.app.tuff', 'com.tagzxia.app.tuff.dev'])

function normalizeComparablePath(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/\/+$/g, '').toLowerCase()
}

export function isSelfExecutablePath(
  candidatePath: string | null | undefined,
  selfExecutablePath = process.execPath
): boolean {
  if (!candidatePath || !selfExecutablePath) return false

  const candidate = normalizeComparablePath(candidatePath)
  const self = normalizeComparablePath(selfExecutablePath)
  if (!candidate || !self) return false

  return candidate === self || candidate.startsWith(`${self}/`) || self.startsWith(`${candidate}/`)
}

export function isSelfBundleId(bundleId: string | null | undefined): boolean {
  return Boolean(bundleId && SELF_BUNDLE_IDS.has(bundleId.trim().toLowerCase()))
}

export function isSelfAppIdentity(
  input: {
    executablePath?: string | null
    bundleId?: string | null
  },
  selfExecutablePath = process.execPath
): boolean {
  return (
    isSelfBundleId(input.bundleId) || isSelfExecutablePath(input.executablePath, selfExecutablePath)
  )
}
