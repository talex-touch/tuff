import type { BundledReleaseNotesCatalog, BundledReleaseNotesEntry } from '@talex-touch/utils'
import { compareUpdateVersions } from '../../../../shared/update/version'

export type ReleaseNotesStartupDecision =
  | { kind: 'none' }
  | { kind: 'acknowledge'; version: string }
  | { kind: 'show'; entries: BundledReleaseNotesEntry[]; version: string }

export function resolveReleaseNotesStartupDecision(input: {
  catalog: BundledReleaseNotesCatalog
  lastAcknowledgedVersion: string | null
  onboardingComplete: boolean
}): ReleaseNotesStartupDecision {
  const currentVersion = input.catalog.generatedForVersion
  if (!input.onboardingComplete) {
    return { kind: 'acknowledge', version: currentVersion }
  }

  if (!input.lastAcknowledgedVersion) {
    const currentEntry = input.catalog.entries.find((entry) => entry.version === currentVersion)
    return currentEntry
      ? { kind: 'show', entries: [currentEntry], version: currentVersion }
      : { kind: 'acknowledge', version: currentVersion }
  }

  if (compareUpdateVersions(currentVersion, input.lastAcknowledgedVersion) <= 0) {
    return { kind: 'none' }
  }

  const entries = input.catalog.entries
    .filter((entry) => {
      return (
        compareUpdateVersions(entry.version, input.lastAcknowledgedVersion!) > 0 &&
        compareUpdateVersions(entry.version, currentVersion) <= 0
      )
    })
    .sort((left, right) => compareUpdateVersions(left.version, right.version))

  return entries.length > 0
    ? { kind: 'show', entries, version: currentVersion }
    : { kind: 'acknowledge', version: currentVersion }
}
