import type {
  DownloadProgress,
  UpdateLifecyclePhase,
  UpdateLifecycleSnapshot
} from '@talex-touch/utils'
import type { BuildAuthenticity } from './update-diagnostic-evidence'

/**
 * How long an `available` update waits for the automatic download before the manual button shows.
 *
 * The main process only reaches `downloading` after fetching the release manifest (up to 8s), so a
 * button offered during that window starts a second download racing the automatic one. Past this
 * point the automatic download evidently did not start (a dev build, or it failed), and the button
 * is the way out.
 */
export const AUTO_DOWNLOAD_GRACE_MS = 15_000

export type UpdateStatusActionKind = 'check' | 'retry' | 'download' | 'install'

export interface UpdateStatusMessage {
  key: string
  params?: Record<string, string>
}

/** The line under the title. Status data rather than a description: a version, progress, a reason. */
export type UpdateStatusDetail =
  | { kind: 'text'; text: string }
  | { kind: 'message'; message: UpdateStatusMessage }
  | { kind: 'progress'; percent: number; downloaded: string; total: string; speed: string }

export type UpdateStatusProgress =
  | { kind: 'indeterminate'; tone: 'default' | 'warning' }
  | { kind: 'determinate'; percentage: number }

export interface UpdateStatusAction {
  kind: UpdateStatusActionKind
  labelKey: string
  loading: boolean
  disabled: boolean
}

export interface UpdateStatusRowView {
  kind: 'status'
  phase: UpdateLifecyclePhase
  title: UpdateStatusMessage
  detail: UpdateStatusDetail | null
  progress: UpdateStatusProgress | null
  action: UpdateStatusAction | null
}

export type UpdateStatusView = { kind: 'skeleton' } | UpdateStatusRowView

export interface UpdateStatusViewInput {
  snapshot: UpdateLifecycleSnapshot | null
  /** The first status request has not answered yet. */
  loading: boolean
  /**
   * The running app's version, from its package.json; `null` until that has loaded. Not
   * `startupInfo.version`, which is the build kind (`dev` / `release`). The snapshot's
   * `currentVersion` is where an attempt started, so it only stands in when this is missing.
   */
  currentVersion: string | null
  autoDownload: boolean
  /** When this page saw the attempt enter `available`. */
  availableSinceMs: number | null
  nowMs: number
  platform: string
  authenticity: BuildAuthenticity
  downloadProgress: DownloadProgress | null
  /** A cached release with a package for this device exists. */
  canStartDownload: boolean
  checkRequestPending: boolean
  /** Settings are still loading; a check started now would race that load. */
  checkLocked: boolean
  downloadRequestPending: boolean
  installRequestPending: boolean
}

export function resolveUpdateStatusView(input: UpdateStatusViewInput): UpdateStatusView {
  const { snapshot } = input
  // While the status request is out, hold the skeleton for anything the card draws from: the
  // snapshot, and the version (the beta-build channel row depends on it). Once the request has
  // answered, draw with what there is rather than wait on a version that may never come.
  if (input.loading && (!snapshot || !input.currentVersion)) return { kind: 'skeleton' }

  const phase = snapshot?.phase ?? 'idle'
  const currentVersion = formatUpdateVersionLabel(input.currentVersion || snapshot?.currentVersion)
  const targetVersion = formatUpdateVersionLabel(snapshot?.targetVersion ?? snapshot?.releaseTag)
  const row = (
    title: UpdateStatusMessage,
    detail: UpdateStatusDetail | null = null,
    progress: UpdateStatusProgress | null = null,
    action: UpdateStatusAction | null = null
  ): UpdateStatusRowView => ({ kind: 'status', phase, title, detail, progress, action })
  const checkAction = (kind: 'check' | 'retry'): UpdateStatusAction => ({
    kind,
    labelKey:
      kind === 'retry'
        ? 'settings.settingUpdate.actions.retry'
        : 'settings.settingUpdate.actions.manualCheck',
    loading: input.checkRequestPending || phase === 'checking',
    disabled: input.checkLocked
  })
  const indeterminate = (tone: 'default' | 'warning' = 'default'): UpdateStatusProgress => ({
    kind: 'indeterminate',
    tone
  })

  switch (phase) {
    case 'checking':
      return row(
        message('settings.settingUpdate.status.checking'),
        text(currentVersion),
        null,
        checkAction('check')
      )

    case 'available': {
      const elapsed = input.nowMs - (input.availableSinceMs ?? input.nowMs)
      if (input.autoDownload && !input.downloadRequestPending && elapsed < AUTO_DOWNLOAD_GRACE_MS) {
        return row(
          message('settings.settingUpdate.status.preparing', { version: targetVersion }),
          null,
          indeterminate()
        )
      }
      return row(
        message('settings.settingUpdate.status.available', { version: targetVersion }),
        null,
        null,
        {
          kind: 'download',
          labelKey: 'settings.settingUpdate.actions.downloadAvailable',
          loading: input.downloadRequestPending,
          disabled: !input.canStartDownload
        }
      )
    }

    case 'downloading': {
      const title = message('settings.settingUpdate.status.downloading', { version: targetVersion })
      const measured = measureDownload(input.downloadProgress)
      if (!measured) return row(title, null, indeterminate())
      return row(
        title,
        {
          kind: 'progress',
          percent: Math.floor(measured.percentage),
          downloaded: formatFileSize(measured.downloadedSize),
          total: formatFileSize(measured.totalSize),
          speed: formatFileSize(measured.speed)
        },
        { kind: 'determinate', percentage: measured.percentage }
      )
    }

    case 'verifying':
      return row(
        message('settings.settingUpdate.status.verifying', { version: targetVersion }),
        null,
        indeterminate()
      )

    case 'ready': {
      // Installing an unofficial macOS build is refused by the main process, on quit as well as on
      // request, so there is nothing to offer here. The authenticity banner above carries the one
      // way forward — its download link — and this row only says why it stops.
      const blocked = input.platform === 'darwin' && input.authenticity === 'unofficial'
      const title = message('settings.settingUpdate.status.ready', { version: targetVersion })
      if (blocked) {
        return row(title, {
          kind: 'message',
          message: message('settings.settingUpdate.status.readyBlocked')
        })
      }
      return row(
        title,
        snapshot?.installOnNormalQuit
          ? { kind: 'message', message: message('settings.settingUpdate.status.readyOnQuit') }
          : null,
        null,
        {
          kind: 'install',
          labelKey: resolveInstallLabelKey(input.platform),
          loading: input.installRequestPending,
          disabled: !snapshot?.taskId
        }
      )
    }

    case 'install-scheduled':
    case 'handoff-started':
      return row(
        message('settings.settingUpdate.status.installing', { version: targetVersion }),
        null,
        indeterminate()
      )

    case 'awaiting-health':
      return row(message('settings.settingUpdate.status.finishing'), null, indeterminate())

    case 'recovery-required':
    case 'recovering':
      return row(
        message('settings.settingUpdate.status.recovering'),
        null,
        indeterminate('warning')
      )

    case 'failed':
      return row(
        message('settings.settingUpdate.status.failed'),
        snapshot?.error?.message ? text(snapshot.error.message) : null,
        null,
        checkAction('retry')
      )

    case 'idle':
    case 'healthy':
    case 'recovered':
      break
  }

  if (phase !== 'recovered' && snapshot?.lastCheckAt) {
    return row(
      message('settings.settingUpdate.status.latest'),
      text(currentVersion),
      null,
      checkAction('check')
    )
  }
  return row(
    message('settings.settingUpdate.status.currentVersion', { version: currentVersion }),
    null,
    null,
    checkAction('check')
  )
}

/**
 * The one label for every version on the update page. Release tags (`targetVersion`, history
 * `toVersion`) carry a leading `v`; app versions (the package.json version, `fromVersion`) do not.
 * `2.4.14-beta.46` and `v2.4.14-beta.46` both read `v2.4.14-beta.46`.
 */
export function formatUpdateVersionLabel(version: string | null | undefined): string {
  const trimmed = version?.trim()
  return trimmed ? `v${trimmed.replace(/^v/i, '')}` : ''
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const digits = unitIndex === 0 ? 0 : size < 10 ? 1 : 0
  return `${size.toFixed(digits)} ${units[unitIndex]}`
}

function resolveInstallLabelKey(platform: string): string {
  if (platform === 'darwin') return 'settings.settingUpdate.actions.restartMac'
  if (platform === 'win32') return 'settings.settingUpdate.actions.startWindowsInstaller'
  return 'settings.settingUpdate.actions.openLinuxPackage'
}

/** Progress is only measurable once the total size is known; before that the bar stays indeterminate. */
function measureDownload(
  progress: DownloadProgress | null
): { percentage: number; downloadedSize: number; totalSize: number; speed: number } | null {
  const totalSize = progress?.totalSize ?? 0
  if (!progress || !(totalSize > 0)) return null

  const downloadedSize = Math.max(0, progress.downloadedSize || 0)
  const reported = Number.isFinite(progress.percentage)
    ? progress.percentage
    : (downloadedSize / totalSize) * 100
  return {
    percentage: Math.min(100, Math.max(0, reported)),
    downloadedSize,
    totalSize,
    speed: Math.max(0, progress.speed || 0)
  }
}

function message(key: string, params?: Record<string, string>): UpdateStatusMessage {
  return params ? { key, params } : { key }
}

function text(value: string): UpdateStatusDetail | null {
  return value ? { kind: 'text', text: value } : null
}
