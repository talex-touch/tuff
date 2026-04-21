import type { EverythingStatusResponse } from '../../../../../shared/events/everything'

export function resolveEverythingStatusTextKey(status: EverythingStatusResponse | null): string {
  if (!status) return 'settings.settingEverything.statusChecking'
  if (!status.enabled) return 'settings.settingEverything.statusDisabled'
  if (!status.available) return 'settings.settingEverything.statusUnavailable'
  return 'settings.settingEverything.statusEnabled'
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
  return Boolean(status?.enabled && !status.available)
}
