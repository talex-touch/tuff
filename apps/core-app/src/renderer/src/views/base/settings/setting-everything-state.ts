import type {
  EverythingDiagnosticStage,
  EverythingInstallationState,
  EverythingInstallPhase,
  EverythingStatusResponse
} from '../../../../../shared/events/everything'

export function resolveEverythingStatusTextKey(status: EverythingStatusResponse | null): string {
  if (!status) return 'settings.settingEverything.statusChecking'
  if (!status.enabled) return 'settings.settingEverything.statusDisabled'
  if (!status.available) return 'settings.settingEverything.statusUnavailable'
  return 'settings.settingEverything.statusEnabled'
}

/*
 * The three keys below word main's English sentences from the codes that come with them:
 * `healthReason`, the installation's `reason` and the install job's `message`. For a backend that
 * failed, main's text is the raw error, which the page already lists under its error details.
 */

/** Why file search is not healthy, or null when it is. */
export function resolveEverythingHealthReasonKey(
  status: EverythingStatusResponse | null
): string | null {
  if (!status || status.health === 'healthy') return null
  if (status.health === 'unsupported') return 'settings.settingEverything.healthReasonUnsupported'
  return status.enabled
    ? 'settings.settingEverything.healthReasonNotReady'
    : 'settings.settingEverything.healthReasonDisabled'
}

/** What the installation check found, or null when there is nothing to explain. */
export function resolveEverythingInstallReasonKey(
  state: EverythingInstallationState | undefined
): string | null {
  if (!state || state === 'ready') return null
  return `settings.settingEverything.installReason.${state}`
}

/** The install job's progress line, or null before a job has started. */
export function resolveEverythingInstallMessageKey(
  phase: EverythingInstallPhase | undefined
): string | null {
  if (!phase || phase === 'idle') return null
  if (phase === 'unsupported') return 'settings.settingEverything.installUnsupported'
  return `settings.settingEverything.installMessage.${phase}`
}

export function resolveEverythingStatusColor(status: EverythingStatusResponse | null): string {
  if (!status) return 'text-gray-500'
  if (!status.enabled) return 'text-yellow-500'
  if (!status.available) return 'text-red-500'
  return 'text-green-500'
}

export function shouldShowEverythingToggle(status: EverythingStatusResponse | null): boolean {
  return Boolean(status)
}

export function shouldShowEverythingInstallGuide(status: EverythingStatusResponse | null): boolean {
  if (!status?.enabled || status.available) return false

  const recommendation = status.installation?.recommendation
  if (!recommendation) return true

  return ['install-everything', 'install-cli', 'check-manually'].includes(recommendation)
}

export function shouldShowEverythingDiagnostics(status: EverythingStatusResponse | null): boolean {
  return Boolean(status?.diagnostics && Object.keys(status.diagnostics.stages).length > 0)
}

export function getEverythingDiagnosticStages(
  status: EverythingStatusResponse | null
): EverythingDiagnosticStage[] {
  if (!status?.diagnostics) {
    return []
  }
  return (
    ['sdk-load', 'sdk-query', 'cli-detect', 'cli-query'] as EverythingDiagnosticStage[]
  ).filter((stage) => Boolean(status.diagnostics?.stages[stage]))
}
