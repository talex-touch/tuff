import type { AppSetting } from '@talex-touch/utils'
import type { QuickOpsPomodoroMode, QuickOpsScreenCleanMode } from './quick-ops-session-manager'

export type QuickOpsAction =
  | 'keep-awake-start'
  | 'keep-awake-extend'
  | 'keep-awake-stop'
  | 'system-awake-start'
  | 'system-awake-stop'
  | 'timer-start'
  | 'timer-extend'
  | 'timer-pause'
  | 'timer-resume'
  | 'timer-stop'
  | 'pomodoro-start'
  | 'pomodoro-pause'
  | 'pomodoro-resume'
  | 'pomodoro-stop'
  | 'screen-clean-start'
  | 'screen-clean-stop'
  | 'stopwatch-start'
  | 'stopwatch-pause'
  | 'stopwatch-resume'
  | 'stopwatch-lap'
  | 'stopwatch-reset'

export interface QuickOpsPublicIpInfo {
  address: string
  source: string
}

export interface QuickOpsDegradedResult {
  degradedReason: string
  message: string
}

export interface QuickOpsFileHashInfo {
  path: string
  fileName: string
  size: number
  md5: string
  sha1: string
  sha256: string
}

export interface QuickOpsFileHashBatchInfo {
  files: QuickOpsFileHashInfo[]
  totalSize: number
}

export interface QuickOpsFileBase64Info {
  path: string
  fileName: string
  size: number
  base64: string
}

export interface QuickOpsFileBase64BatchInfo {
  files: QuickOpsFileBase64Info[]
  totalSize: number
}

export interface QuickOpsFileBase64DecodeInfo {
  path: string
  fileName: string
  size: number
}

export interface QuickOpsTempTextFileInfo {
  path: string
  fileName: string
  size: number
}

export interface QuickOpsTempDirectoryInfo {
  path: string
  directoryName: string
}

export interface QuickOpsRecentDownloadInfo {
  path: string
  fileName: string
  size: number
  modifiedAt: number
}

export interface QuickOpsRecentDownloadMoveInfo extends QuickOpsRecentDownloadInfo {
  targetDirectory: string
  targetPath: string
}

export interface QuickOpsFilePathInfo {
  path: string
  fileName: string
  shellPath: string
  fileUrl: string
  windowsPath?: string
  wslPath?: string
}

export type QuickOpsCommonDirectoryId = 'desktop' | 'downloads' | 'documents' | 'app-data' | 'logs'

export interface QuickOpsCommonDirectoryInfo {
  id: QuickOpsCommonDirectoryId
  title: string
  subtitle: string
  path: string
}

export interface QuickOpsDirectoryUsageTarget {
  label: string
  path: string
}

export interface ParsedQuickOpsQuery {
  action: QuickOpsAction
  durationMs?: number
  breakDurationMs?: number
  pomodoroCycles?: number
  pomodoroLongBreakMs?: number
  pomodoroLongBreakEvery?: number
  pomodoroMode?: QuickOpsPomodoroMode
  screenMode?: QuickOpsScreenCleanMode
}

export type ParsedPomodoroCycle = Pick<
  ParsedQuickOpsQuery,
  | 'durationMs'
  | 'breakDurationMs'
  | 'pomodoroCycles'
  | 'pomodoroLongBreakMs'
  | 'pomodoroLongBreakEvery'
  | 'pomodoroMode'
>

export interface QuickOpsCustomPomodoroTemplate {
  name: string
  aliases: string[]
  focusMinutes: number
  breakMinutes: number
  enabled: boolean
}

export interface QuickOpsResolvedSettings {
  enabled: boolean
  showRunningSessionsInCoreBox: boolean
  allowStatefulTools: boolean
  allowNetworkTools: boolean
  allowFileTools: boolean
  allowSystemTools: boolean
  allowDeveloperTools: boolean
  allowHighRiskTools: boolean
  defaultKeepAwakeDurationMs: number
  defaultSystemAwakeDurationMs: number
  defaultTimerDurationMs: number
  defaultTimerExtendMs: number
  defaultPomodoroFocusMs: number
  defaultPomodoroBreakMs: number
  pomodoroTemplates: {
    classic: boolean
    long: boolean
    custom: QuickOpsCustomPomodoroTemplate[]
  }
  defaultScreenCleanDurationMs: number
  defaultScreenCleanMode: QuickOpsScreenCleanMode
  allowPublicIpLookup: boolean
}

export type QuickOpsSettingsInput = Partial<Omit<AppSetting['quickOps'], 'pomodoroTemplates'>> & {
  pomodoroTemplates?: Partial<AppSetting['quickOps']['pomodoroTemplates']>
}

export type QuickOpsSettingsResolver = () => QuickOpsSettingsInput | undefined
