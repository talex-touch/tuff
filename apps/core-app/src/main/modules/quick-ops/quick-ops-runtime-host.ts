import type {
  QuickOpsCapabilityInfo,
  QuickOpsDiagnosticsInfo
} from '@talex-touch/utils/transport/events/types'
import type {
  QuickOpsPomodoroMode,
  QuickOpsScreenCleanMode,
  QuickOpsSession,
  QuickOpsSessionChangeListener
} from './quick-ops-session-manager'
import { QuickOpsSessionManager } from './quick-ops-session-manager'
import { createQuickOpsCapabilityInfo } from './quick-ops-capability-service'
import { createDiagnosticsInfo } from './quick-ops-system-service'
import { getQuickOpsResolvedSettings, readQuickOpsSettings } from './quick-ops-settings'
import type { QuickOpsResolvedSettings, QuickOpsSettingsResolver } from './quick-ops-runtime-types'

export {
  formatDuration,
  getSessionDisplayDurationMs,
  QuickOpsSessionManager
} from './quick-ops-session-manager'
export * from './quick-ops-runtime-types'
export * from './quick-ops-settings'
export * from './quick-ops-query-parser'
export * from './quick-ops-network-service'
export * from './quick-ops-filesystem-service'
export * from './quick-ops-system-service'
export * from './quick-ops-capability-service'

export interface QuickOpsRuntimeDependencies {
  createCapabilityInfo(settings: QuickOpsResolvedSettings): QuickOpsCapabilityInfo
  createDiagnosticsInfo(settings: QuickOpsResolvedSettings): QuickOpsDiagnosticsInfo
}

const defaultRuntimeDependencies: QuickOpsRuntimeDependencies = {
  createCapabilityInfo: createQuickOpsCapabilityInfo,
  createDiagnosticsInfo
}

export class QuickOpsRuntimeHost {
  constructor(
    private readonly sessions = new QuickOpsSessionManager(),
    private readonly resolveSettings: QuickOpsSettingsResolver = readQuickOpsSettings,
    private readonly dependencies: QuickOpsRuntimeDependencies = defaultRuntimeDependencies
  ) {}

  onDeactivate(): void {
    this.sessions.stopAll('runtime-deactivate')
  }

  onDestroy(): void {
    this.sessions.stopAll('runtime-destroy')
  }

  cleanup(reason = 'cleanup'): void {
    this.sessions.stopAll(reason)
  }

  getCapabilityInfo(): QuickOpsCapabilityInfo {
    return this.dependencies.createCapabilityInfo(
      getQuickOpsResolvedSettings(this.resolveSettings())
    )
  }

  getDiagnosticsInfo(): QuickOpsDiagnosticsInfo {
    return this.dependencies.createDiagnosticsInfo(
      getQuickOpsResolvedSettings(this.resolveSettings())
    )
  }

  startKeepAwake(durationMs?: number) {
    return this.sessions.startKeepAwake(durationMs)
  }

  startSystemAwake(durationMs?: number) {
    return this.sessions.startSystemAwake(durationMs)
  }

  startTimer(durationMs?: number) {
    return this.sessions.startTimer(durationMs)
  }

  pauseTimer() {
    return this.sessions.pauseTimer()
  }

  resumeTimer() {
    return this.sessions.resumeTimer()
  }

  startPomodoro(
    durationMs?: number,
    mode?: QuickOpsPomodoroMode,
    breakDurationMs?: number,
    totalCycles?: number,
    longBreakDurationMs?: number,
    longBreakEveryCycles?: number
  ) {
    return this.sessions.startPomodoro(
      durationMs,
      mode,
      breakDurationMs,
      totalCycles,
      longBreakDurationMs,
      longBreakEveryCycles
    )
  }

  pausePomodoro() {
    return this.sessions.pausePomodoro()
  }

  resumePomodoro() {
    return this.sessions.resumePomodoro()
  }

  startScreenClean(durationMs?: number, screenMode?: QuickOpsScreenCleanMode) {
    return this.sessions.startScreenClean(durationMs, screenMode)
  }

  startStopwatch() {
    return this.sessions.startStopwatch()
  }

  pauseStopwatch() {
    return this.sessions.pauseStopwatch()
  }

  resumeStopwatch() {
    return this.sessions.resumeStopwatch()
  }

  lapStopwatch() {
    return this.sessions.lapStopwatch()
  }

  stopKeepAwake(reason = 'flow-action'): boolean {
    return this.sessions.stop('keep-awake', reason)
  }

  stopSystemAwake(reason = 'flow-action'): boolean {
    return this.sessions.stop('system-awake', reason)
  }

  stopTimer(reason = 'flow-action'): boolean {
    return this.sessions.stop('timer', reason)
  }

  stopPomodoro(reason = 'flow-action'): boolean {
    return this.sessions.stop('pomodoro', reason)
  }

  stopScreenClean(reason = 'flow-action'): boolean {
    return this.sessions.stop('screen-clean', reason)
  }

  resetStopwatch(reason = 'flow-action'): boolean {
    return this.sessions.stop('stopwatch', reason)
  }

  stopAllSessions(reason = 'flow-action'): number {
    const count = this.sessions.list().length
    if (count > 0) {
      this.sessions.stopAll(reason)
    }
    return count
  }

  listSessions(): QuickOpsSession[] {
    return this.sessions.list()
  }

  subscribeSessions(listener: QuickOpsSessionChangeListener): () => void {
    return this.sessions.subscribe(listener)
  }
}

export const quickOpsRuntime = new QuickOpsRuntimeHost()
