export const WINDOWS_ACCEPTANCE_MANUAL_EVIDENCE_LABELS = {
  commonAppLaunch: [
    'Screenshot or recording',
    'Search query used',
    'Observed display name',
    'Icon evidence',
    'Observed launch target',
    'CoreBox hidden evidence'
  ],
  copiedAppPath: [
    'Copied source',
    'Normalized app path',
    'Add-to-local-launch-area action',
    'Local launch entry',
    'App Index diagnostic evidence path',
    'Search query used after reindex',
    'Indexed search result',
    'Indexed result launch evidence',
    'Screenshot or recording'
  ],
  updateInstall: [
    'Update diagnostic evidence path',
    'Installer path',
    'Installer mode',
    'UAC prompt evidence',
    'App exit evidence',
    'Installer exit evidence',
    'Installed version evidence',
    'App relaunch evidence',
    'Failure rollback evidence',
    'Screenshot or recording'
  ],
  divisionBoxDetachedWidget: [
    'Search query',
    'Detached URL/session identifier',
    'Detached URL source pluginId',
    'Detached URL providerSource',
    'Observed session pluginId',
    'Expected feature pluginId',
    'detachedPayload itemId',
    'detachedPayload query',
    'Screenshot or recording',
    'No fallback mismatch log excerpt'
  ],
  timeAwareRecommendation: [
    'Morning time/context',
    'Morning top itemId',
    'Morning top sourceId',
    'Morning top recommendations',
    'Afternoon time/context',
    'Afternoon top itemId',
    'Afternoon top sourceId',
    'Afternoon top recommendations',
    'Frequent app used for comparison',
    'Frequent comparison itemId',
    'Frequent comparison sourceId',
    'timeSlot/dayOfWeek cache keys',
    'Screenshot or recording',
    'Recommendation trace log excerpt'
  ]
} as const

export type WindowsAcceptanceManualEvidenceKind =
  keyof typeof WINDOWS_ACCEPTANCE_MANUAL_EVIDENCE_LABELS

export function renderWindowsAcceptanceManualEvidenceFields(
  kind: WindowsAcceptanceManualEvidenceKind
): string {
  return WINDOWS_ACCEPTANCE_MANUAL_EVIDENCE_LABELS[kind].map((label) => `- ${label}:`).join('\n')
}
