import type { BrowserWindow as ElectronBrowserWindow, Rectangle } from 'electron'
import type { NotificationRequest } from '@talex-touch/utils/transport/events/types'
import { BrowserWindow, powerSaveBlocker, screen } from 'electron'
import { getLogger } from '@talex-touch/utils/common/logger'
import { notificationModule } from '../../../notification'

export type QuickOpsSessionKind =
  | 'keep-awake'
  | 'system-awake'
  | 'timer'
  | 'pomodoro'
  | 'screen-clean'
  | 'stopwatch'

export type QuickOpsScreenCleanMode = 'black' | 'white' | 'red' | 'green' | 'blue'
export type QuickOpsPomodoroMode = 'focus-only' | 'cycle'
export type QuickOpsPomodoroPhase = 'focus' | 'break'

export interface QuickOpsPomodoroState {
  mode: QuickOpsPomodoroMode
  phase: QuickOpsPomodoroPhase
  cycle: number
  totalCycles?: number
  focusDurationMs: number
  breakDurationMs: number
  longBreakDurationMs?: number
  longBreakEveryCycles?: number
}

export interface QuickOpsSession {
  id: string
  kind: QuickOpsSessionKind
  title: string
  startedAt: number
  durationMs: number
  expiresAt?: number
  pausedAt?: number
  remainingMs?: number
  elapsedMs?: number
  laps?: number[]
  blockerId?: number
  screenMode?: QuickOpsScreenCleanMode
  windows?: ElectronBrowserWindow[]
  closing?: boolean
  pomodoro?: QuickOpsPomodoroState
  timeout?: ReturnType<typeof setTimeout>
}

export type QuickOpsNotifier = (
  request: Omit<NotificationRequest, 'channel'> & { channel?: 'system' }
) => void

export type QuickOpsWindowFactory = (
  bounds: Rectangle,
  session: QuickOpsSession,
  onClosed: (window: ElectronBrowserWindow) => void
) => ElectronBrowserWindow

export type QuickOpsSessionChangeListener = (sessions: QuickOpsSession[]) => void

export const DEFAULT_KEEP_AWAKE_DURATION_MS = 60 * 60 * 1000
export const DEFAULT_KEEP_AWAKE_EXTEND_DURATION_MS = 15 * 60 * 1000
export const DEFAULT_SYSTEM_AWAKE_DURATION_MS = 60 * 60 * 1000
export const DEFAULT_TIMER_DURATION_MS = 25 * 60 * 1000
export const DEFAULT_TIMER_EXTEND_DURATION_MS = 5 * 60 * 1000
export const DEFAULT_POMODORO_DURATION_MS = 25 * 60 * 1000
export const DEFAULT_POMODORO_BREAK_DURATION_MS = 5 * 60 * 1000
export const DEFAULT_SCREEN_CLEAN_DURATION_MS = 60 * 1000

const quickOpsLog = getLogger('quick-ops-session-manager')

export class QuickOpsSessionManager {
  private sessions = new Map<QuickOpsSessionKind, QuickOpsSession>()
  private listeners = new Set<QuickOpsSessionChangeListener>()

  constructor(
    private readonly notify: QuickOpsNotifier = (request) => {
      notificationModule.showInternalSystemNotification(request)
    },
    private readonly createWindow: QuickOpsWindowFactory = createScreenCleanWindow
  ) {}

  startKeepAwake(durationMs = DEFAULT_KEEP_AWAKE_DURATION_MS): QuickOpsSession {
    this.stop('keep-awake', 'replace')
    const blockerId = powerSaveBlocker.start('prevent-display-sleep')
    const session = this.createSession('keep-awake', '保持唤醒', durationMs, blockerId)
    this.sessions.set('keep-awake', session)
    this.emitSessionChange()
    return session
  }

  startSystemAwake(durationMs = DEFAULT_SYSTEM_AWAKE_DURATION_MS): QuickOpsSession {
    this.stop('system-awake', 'replace')
    const blockerId = powerSaveBlocker.start('prevent-app-suspension')
    const session = this.createSession('system-awake', '防止系统睡眠', durationMs, blockerId)
    this.sessions.set('system-awake', session)
    this.emitSessionChange()
    return session
  }

  extendKeepAwake(durationMs: number): QuickOpsSession | null {
    const session = this.sessions.get('keep-awake')
    if (!session?.expiresAt) return null

    this.rescheduleSession(session, session.expiresAt + Math.max(1_000, durationMs))
    quickOpsLog.info('QuickOps keep-awake session extended', {
      meta: {
        kind: session.kind,
        sessionId: session.id,
        durationMs
      }
    })
    this.emitSessionChange()
    return session
  }

  startTimer(durationMs = DEFAULT_TIMER_DURATION_MS): QuickOpsSession {
    this.stop('timer', 'replace')
    const session = this.createSession('timer', '计时器', durationMs)
    this.sessions.set('timer', session)
    this.emitSessionChange()
    return session
  }

  extendTimer(durationMs: number): QuickOpsSession | null {
    const session = this.sessions.get('timer')
    if (!session) return null

    if (session.pausedAt) {
      const extraMs = Math.max(1_000, durationMs)
      session.durationMs += extraMs
      session.remainingMs = Math.max(1_000, (session.remainingMs ?? 0) + extraMs)
      quickOpsLog.info('QuickOps timer session extended', {
        meta: {
          kind: session.kind,
          sessionId: session.id,
          durationMs
        }
      })
      this.emitSessionChange()
      return session
    }

    if (!session.expiresAt) return null

    this.rescheduleSession(session, session.expiresAt + Math.max(1_000, durationMs), durationMs)
    quickOpsLog.info('QuickOps timer session extended', {
      meta: {
        kind: session.kind,
        sessionId: session.id,
        durationMs
      }
    })
    this.emitSessionChange()
    return session
  }

  startPomodoro(
    durationMs = DEFAULT_POMODORO_DURATION_MS,
    mode: QuickOpsPomodoroMode = 'focus-only',
    breakDurationMs = DEFAULT_POMODORO_BREAK_DURATION_MS,
    totalCycles?: number,
    longBreakDurationMs?: number,
    longBreakEveryCycles?: number
  ): QuickOpsSession {
    this.stop('pomodoro', 'replace')
    const blockerId = powerSaveBlocker.start('prevent-display-sleep')
    const session = this.createSession(
      'pomodoro',
      mode === 'cycle' ? '番茄钟专注' : '番茄钟',
      durationMs,
      blockerId
    )
    session.pomodoro = {
      mode,
      phase: 'focus',
      cycle: 1,
      totalCycles: mode === 'cycle' ? totalCycles : undefined,
      focusDurationMs: Math.max(1_000, durationMs),
      breakDurationMs: Math.max(1_000, breakDurationMs),
      longBreakDurationMs: mode === 'cycle' ? longBreakDurationMs : undefined,
      longBreakEveryCycles: mode === 'cycle' ? longBreakEveryCycles : undefined
    }
    this.sessions.set('pomodoro', session)
    this.emitSessionChange()
    return session
  }

  pausePomodoro(): QuickOpsSession | null {
    return this.pauseCountdown('pomodoro')
  }

  resumePomodoro(): QuickOpsSession | null {
    const session = this.sessions.get('pomodoro')
    const defaultDurationMs =
      session?.pomodoro?.phase === 'break'
        ? session.pomodoro.breakDurationMs
        : (session?.pomodoro?.focusDurationMs ?? DEFAULT_POMODORO_DURATION_MS)
    return this.resumeCountdown('pomodoro', defaultDurationMs)
  }

  startScreenClean(
    durationMs = DEFAULT_SCREEN_CLEAN_DURATION_MS,
    screenMode: QuickOpsScreenCleanMode = 'black'
  ): QuickOpsSession {
    this.stop('screen-clean', 'replace')
    const displays = screen.getAllDisplays()
    const targets = displays.length > 0 ? displays : [screen.getPrimaryDisplay()]
    const session = this.createSession('screen-clean', '清洁屏幕', durationMs)
    session.screenMode = screenMode
    session.windows = targets.map((display) =>
      this.createWindow(display.bounds, session, (window) => {
        this.handleScreenCleanWindowClosed(window, session.id)
      })
    )
    this.sessions.set('screen-clean', session)
    this.emitSessionChange()
    return session
  }

  pauseTimer(): QuickOpsSession | null {
    return this.pauseCountdown('timer')
  }

  resumeTimer(): QuickOpsSession | null {
    return this.resumeCountdown('timer', DEFAULT_TIMER_DURATION_MS)
  }

  startStopwatch(): QuickOpsSession {
    this.stop('stopwatch', 'replace')
    const session = this.createSession('stopwatch', '秒表', 0)
    if (session.timeout) {
      clearTimeout(session.timeout)
    }
    session.expiresAt = undefined
    session.timeout = undefined
    session.elapsedMs = 0
    session.laps = []
    this.sessions.set('stopwatch', session)
    this.emitSessionChange()
    return session
  }

  pauseStopwatch(): QuickOpsSession | null {
    const session = this.sessions.get('stopwatch')
    if (!session || session.pausedAt) return null

    session.elapsedMs = this.getStopwatchElapsedMs(session)
    session.pausedAt = Date.now()
    quickOpsLog.info('QuickOps stopwatch paused', {
      meta: {
        kind: session.kind,
        sessionId: session.id,
        elapsedMs: session.elapsedMs
      }
    })
    this.emitSessionChange()
    return session
  }

  resumeStopwatch(): QuickOpsSession | null {
    const session = this.sessions.get('stopwatch')
    if (!session?.pausedAt) return null

    session.startedAt = Date.now()
    session.pausedAt = undefined
    quickOpsLog.info('QuickOps stopwatch resumed', {
      meta: {
        kind: session.kind,
        sessionId: session.id,
        elapsedMs: session.elapsedMs ?? 0
      }
    })
    this.emitSessionChange()
    return session
  }

  lapStopwatch(): QuickOpsSession | null {
    const session = this.sessions.get('stopwatch')
    if (!session) return null

    const elapsedMs = this.getStopwatchElapsedMs(session)
    session.laps = [...(session.laps ?? []), elapsedMs]
    quickOpsLog.info('QuickOps stopwatch lap recorded', {
      meta: {
        kind: session.kind,
        sessionId: session.id,
        lapMs: elapsedMs,
        lapCount: session.laps.length
      }
    })
    this.emitSessionChange()
    return session
  }

  stop(kind: QuickOpsSessionKind, reason = 'manual'): boolean {
    const session = this.sessions.get(kind)
    if (!session) return false

    if (session.timeout) {
      clearTimeout(session.timeout)
    }

    if (typeof session.blockerId === 'number' && powerSaveBlocker.isStarted(session.blockerId)) {
      powerSaveBlocker.stop(session.blockerId)
    }

    this.closeSessionWindows(session)
    this.sessions.delete(kind)
    quickOpsLog.info('QuickOps session stopped', {
      meta: {
        kind,
        reason,
        sessionId: session.id
      }
    })
    this.emitSessionChange()
    return true
  }

  stopAll(reason = 'cleanup'): void {
    for (const kind of Array.from(this.sessions.keys())) {
      this.stop(kind, reason)
    }
  }

  get(kind: QuickOpsSessionKind): QuickOpsSession | null {
    return this.sessions.get(kind) ?? null
  }

  list(): QuickOpsSession[] {
    return Array.from(this.sessions.values())
  }

  subscribe(listener: QuickOpsSessionChangeListener): () => void {
    this.listeners.add(listener)
    listener(this.list())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private pauseCountdown(
    kind: Extract<QuickOpsSessionKind, 'timer' | 'pomodoro'>
  ): QuickOpsSession | null {
    const session = this.sessions.get(kind)
    if (!session?.expiresAt || session.pausedAt) return null

    if (session.timeout) {
      clearTimeout(session.timeout)
      session.timeout = undefined
    }

    session.remainingMs = Math.max(1_000, session.expiresAt - Date.now())
    session.expiresAt = undefined
    session.pausedAt = Date.now()
    quickOpsLog.info('QuickOps countdown session paused', {
      meta: {
        kind: session.kind,
        sessionId: session.id,
        remainingMs: session.remainingMs
      }
    })
    this.emitSessionChange()
    return session
  }

  private resumeCountdown(
    kind: Extract<QuickOpsSessionKind, 'timer' | 'pomodoro'>,
    defaultDurationMs: number
  ): QuickOpsSession | null {
    const session = this.sessions.get(kind)
    if (!session?.pausedAt) return null

    const remainingMs = Math.max(1_000, session.remainingMs ?? defaultDurationMs)
    session.pausedAt = undefined
    session.remainingMs = undefined
    this.rescheduleSession(session, Date.now() + remainingMs)
    quickOpsLog.info('QuickOps countdown session resumed', {
      meta: {
        kind: session.kind,
        sessionId: session.id,
        remainingMs
      }
    })
    this.emitSessionChange()
    return session
  }

  private emitSessionChange(): void {
    const sessions = this.list()
    for (const listener of this.listeners) {
      try {
        listener(sessions)
      } catch (error) {
        quickOpsLog.warn('QuickOps session listener failed', { meta: { error } })
      }
    }
  }

  private closeSessionWindows(session: QuickOpsSession): void {
    if (!session.windows) return

    session.closing = true
    for (const window of session.windows) {
      if (!window.isDestroyed()) {
        window.close()
      }
    }
    session.windows = []
  }

  private handleScreenCleanWindowClosed(window: ElectronBrowserWindow, sessionId: string): void {
    const session = this.sessions.get('screen-clean')
    if (!session || session.id !== sessionId) return

    session.windows = (session.windows ?? []).filter((item) => item !== window)
    if (!session.closing && session.windows.length === 0) {
      this.stop('screen-clean', 'window-closed')
    }
  }

  private getStopwatchElapsedMs(session: QuickOpsSession): number {
    if (session.kind !== 'stopwatch') return 0
    if (session.pausedAt) return Math.max(0, session.elapsedMs ?? 0)
    return Math.max(0, (session.elapsedMs ?? 0) + Date.now() - session.startedAt)
  }

  private createSession(
    kind: QuickOpsSessionKind,
    title: string,
    durationMs: number,
    blockerId?: number
  ): QuickOpsSession {
    const startedAt = Date.now()
    const expiresAt = startedAt + Math.max(1_000, durationMs)
    const session: QuickOpsSession = {
      id: `quick-ops:${kind}:${startedAt}`,
      kind,
      title,
      startedAt,
      durationMs: Math.max(1_000, durationMs),
      expiresAt,
      blockerId
    }

    session.timeout = setTimeout(
      () => {
        this.finishExpired(kind)
      },
      Math.max(1_000, durationMs)
    )

    if (typeof session.timeout === 'object' && 'unref' in session.timeout) {
      session.timeout.unref()
    }

    return session
  }

  private rescheduleSession(
    session: QuickOpsSession,
    nextExpiresAt: number,
    durationDeltaMs = 0
  ): void {
    if (session.timeout) {
      clearTimeout(session.timeout)
    }

    session.durationMs += Math.max(0, durationDeltaMs)
    session.expiresAt = nextExpiresAt
    session.pausedAt = undefined
    session.remainingMs = undefined
    const timeoutMs = Math.max(1_000, nextExpiresAt - Date.now())
    session.timeout = setTimeout(() => {
      this.finishExpired(session.kind)
    }, timeoutMs)

    if (typeof session.timeout === 'object' && 'unref' in session.timeout) {
      session.timeout.unref()
    }
  }

  private finishExpired(kind: QuickOpsSessionKind): void {
    const session = this.sessions.get(kind)
    if (!session) return

    if (kind === 'timer') {
      this.notify({
        id: `quick-ops:timer-finished:${session.startedAt}`,
        title: 'QuickOps 计时结束',
        message: `${formatDuration(session.durationMs)}计时已结束`,
        level: 'success',
        dedupeKey: `quick-ops:timer-finished:${session.id}`,
        system: { silent: false },
        meta: {
          quickOps: {
            kind,
            sessionId: session.id
          }
        }
      })
    } else if (kind === 'pomodoro') {
      this.finishPomodoroSession(session)
      return
    }

    this.stop(kind, 'expired')
  }

  private finishPomodoroSession(session: QuickOpsSession): void {
    const state = session.pomodoro
    if (state?.mode !== 'cycle') {
      this.notify({
        id: `quick-ops:pomodoro-finished:${session.startedAt}`,
        title: 'QuickOps 番茄钟结束',
        message: `${formatDuration(session.durationMs)}专注已结束`,
        level: 'success',
        dedupeKey: `quick-ops:pomodoro-finished:${session.id}`,
        system: { silent: false },
        meta: {
          quickOps: {
            kind: session.kind,
            sessionId: session.id
          }
        }
      })
      this.stop('pomodoro', 'expired')
      return
    }

    if (state.phase === 'focus') {
      if (state.totalCycles && state.cycle >= state.totalCycles) {
        this.notify({
          id: `quick-ops:pomodoro-cycle-finished:${session.startedAt}`,
          title: 'QuickOps 番茄钟循环结束',
          message: `已完成${state.totalCycles}轮${formatDuration(state.focusDurationMs)}专注`,
          level: 'success',
          dedupeKey: `quick-ops:pomodoro-cycle-finished:${session.id}`,
          system: { silent: false },
          meta: {
            quickOps: {
              kind: session.kind,
              sessionId: session.id,
              phase: state.phase,
              cycle: state.cycle,
              totalCycles: state.totalCycles
            }
          }
        })
        this.stop('pomodoro', 'expired')
        return
      }

      const nextBreakDurationMs = getPomodoroBreakDurationMs(state)
      const isLongBreak = nextBreakDurationMs !== state.breakDurationMs
      this.notify({
        id: `quick-ops:pomodoro-focus-finished:${session.startedAt}`,
        title: 'QuickOps 番茄钟专注结束',
        message: `${formatDuration(state.focusDurationMs)}专注已结束，进入${formatDuration(nextBreakDurationMs)}${isLongBreak ? '长休息' : '休息'}`,
        level: 'success',
        dedupeKey: `quick-ops:pomodoro-focus-finished:${session.id}:${state.cycle}`,
        system: { silent: false },
        meta: {
          quickOps: {
            kind: session.kind,
            sessionId: session.id,
            phase: state.phase,
            cycle: state.cycle
          }
        }
      })
      this.transitionPomodoroSession(session, 'break', nextBreakDurationMs, state.cycle)
      return
    }

    this.notify({
      id: `quick-ops:pomodoro-break-finished:${session.startedAt}`,
      title: 'QuickOps 番茄钟休息结束',
      message: `${formatDuration(session.durationMs)}休息已结束，开始第${state.cycle + 1}轮专注`,
      level: 'success',
      dedupeKey: `quick-ops:pomodoro-break-finished:${session.id}:${state.cycle}`,
      system: { silent: false },
      meta: {
        quickOps: {
          kind: session.kind,
          sessionId: session.id,
          phase: state.phase,
          cycle: state.cycle
        }
      }
    })
    this.transitionPomodoroSession(session, 'focus', state.focusDurationMs, state.cycle + 1)
  }

  private transitionPomodoroSession(
    session: QuickOpsSession,
    phase: QuickOpsPomodoroPhase,
    durationMs: number,
    cycle: number
  ): void {
    if (!session.pomodoro) return

    if (session.timeout) {
      clearTimeout(session.timeout)
    }

    const now = Date.now()
    const safeDurationMs = Math.max(1_000, durationMs)
    session.title = phase === 'break' ? '番茄钟休息' : '番茄钟专注'
    session.startedAt = now
    session.durationMs = safeDurationMs
    session.expiresAt = now + safeDurationMs
    session.pausedAt = undefined
    session.remainingMs = undefined
    session.pomodoro = {
      ...session.pomodoro,
      phase,
      cycle
    }
    session.timeout = setTimeout(() => {
      this.finishExpired('pomodoro')
    }, safeDurationMs)

    if (typeof session.timeout === 'object' && 'unref' in session.timeout) {
      session.timeout.unref()
    }

    quickOpsLog.info('QuickOps pomodoro session transitioned', {
      meta: {
        sessionId: session.id,
        phase,
        cycle,
        durationMs: safeDurationMs
      }
    })
    this.emitSessionChange()
  }
}

function getPomodoroBreakDurationMs(state: QuickOpsPomodoroState): number {
  const longBreakDurationMs = state.longBreakDurationMs
  const longBreakEveryCycles = state.longBreakEveryCycles
  if (
    !longBreakDurationMs ||
    !longBreakEveryCycles ||
    state.cycle < 1 ||
    state.cycle % longBreakEveryCycles !== 0
  ) {
    return state.breakDurationMs
  }

  return longBreakDurationMs
}

function createScreenCleanWindow(
  bounds: Rectangle,
  session: QuickOpsSession,
  onClosed: (window: ElectronBrowserWindow) => void
): ElectronBrowserWindow {
  const palette = getScreenCleanPalette(session.screenMode ?? 'black')
  const window = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    fullscreen: true,
    kiosk: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: palette.windowBackground,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.setAlwaysOnTop(true, 'screen-saver')
  window.loadURL(createScreenCleanOverlayUrl(session.durationMs, session.screenMode ?? 'black'))
  window.once('closed', () => {
    onClosed(window)
  })
  window.show()
  window.focus()
  return window
}

export function createScreenCleanOverlayUrl(
  durationMs: number,
  screenMode: QuickOpsScreenCleanMode
): string {
  const durationLabel = formatDuration(durationMs)
  const palette = getScreenCleanPalette(screenMode)
  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>QuickOps Screen Clean</title>
    <style>
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: ${palette.background};
        color: ${palette.text};
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        user-select: none;
        cursor: none;
      }

      .hint {
        position: fixed;
        inset-inline: 0;
        bottom: 32px;
        display: flex;
        justify-content: center;
        font-size: 13px;
        letter-spacing: 0;
      }

      .hold-progress {
        width: 0;
        height: 2px;
        margin-left: 10px;
        align-self: center;
        border-radius: 999px;
        background: ${palette.progress};
        transition: width 1.2s linear;
      }

      .hint.is-holding .hold-progress {
        width: 64px;
      }
    </style>
  </head>
  <body>
    <div id="hint" class="hint">QuickOps ${palette.label} · ${escapeHtml(durationLabel)} 后自动退出 · 长按 Esc 退出<span class="hold-progress"></span></div>
    <script>
      const hint = document.getElementById('hint')
      let closeTimer = null

      window.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || closeTimer) return
        hint.classList.add('is-holding')
        closeTimer = window.setTimeout(() => {
          window.close()
        }, 1200)
      })

      window.addEventListener('keyup', (event) => {
        if (event.key !== 'Escape' || !closeTimer) return
        window.clearTimeout(closeTimer)
        closeTimer = null
        hint.classList.remove('is-holding')
      })
    </script>
  </body>
</html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

function getScreenCleanPalette(screenMode: QuickOpsScreenCleanMode): {
  label: string
  windowBackground: string
  background: string
  text: string
  progress: string
} {
  switch (screenMode) {
    case 'white':
      return {
        label: '白底清洁屏幕',
        windowBackground: '#ffffff',
        background: '#f7f7f2',
        text: 'rgba(0, 0, 0, 0.62)',
        progress: 'rgba(0, 0, 0, 0.72)'
      }
    case 'red':
      return {
        label: '红色屏幕测试',
        windowBackground: '#ff0000',
        background: '#ff0000',
        text: 'rgba(255, 255, 255, 0.86)',
        progress: 'rgba(255, 255, 255, 0.9)'
      }
    case 'green':
      return {
        label: '绿色屏幕测试',
        windowBackground: '#00ff00',
        background: '#00ff00',
        text: 'rgba(0, 0, 0, 0.68)',
        progress: 'rgba(0, 0, 0, 0.76)'
      }
    case 'blue':
      return {
        label: '蓝色屏幕测试',
        windowBackground: '#0000ff',
        background: '#0000ff',
        text: 'rgba(255, 255, 255, 0.86)',
        progress: 'rgba(255, 255, 255, 0.9)'
      }
    case 'black':
      return {
        label: '黑底清洁屏幕',
        windowBackground: '#000000',
        background: '#050505',
        text: 'rgba(255, 255, 255, 0.74)',
        progress: 'rgba(255, 255, 255, 0.78)'
      }
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}小时${minutes > 0 ? `${minutes}分钟` : ''}`
  }
  if (minutes > 0) {
    return `${minutes}分钟${seconds > 0 ? `${seconds}秒` : ''}`
  }
  return `${seconds}秒`
}

export function getSessionDisplayDurationMs(session: QuickOpsSession): number {
  if (session.kind === 'stopwatch') {
    if (session.pausedAt) return Math.max(0, session.elapsedMs ?? 0)
    return Math.max(0, (session.elapsedMs ?? 0) + Date.now() - session.startedAt)
  }
  if (session.pausedAt) {
    return Math.max(0, session.remainingMs ?? 0)
  }
  return Math.max(0, (session.expiresAt ?? Date.now()) - Date.now())
}
