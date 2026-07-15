#!/usr/bin/env tsx
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import path from 'node:path'
import process from 'node:process'
import packageJson from '../package.json'

interface CliOptions {
  appBundle: string
  cdpPort: number
  userDataDir: string
  outputDir: string
  dateStamp: string
  keepUserData: boolean
  pretty: boolean
  launchTimeoutMs: number
}

interface DevToolsTarget {
  id: string
  title: string
  type: string
  url: string
  webSocketDebuggerUrl?: string
}

function isRendererTarget(target: DevToolsTarget): boolean {
  return (
    target.type === 'page' &&
    Boolean(target.webSocketDebuggerUrl) &&
    target.url.includes('/renderer/index.html')
  )
}

function isLikelyAssistantWindowTarget(target: DevToolsTarget): boolean {
  return isRendererTarget(target) && !target.url.includes('/meta-overlay')
}

interface CdpResponse {
  result?: {
    data?: string
    result?: {
      value?: unknown
    }
  }
  error?: {
    message?: string
  }
}

type CdpSend = (method: string, params?: Record<string, unknown>) => Promise<CdpResponse>

interface RectSnapshot {
  left: number
  top: number
  width: number
  height: number
}

interface SettingsDomSnapshot {
  href: string
  title: string
  readyState: string
  text: string
  hasSettingsShell: boolean
  hasFloatingBall: boolean
  hasVoicePanel: boolean
  assistantEnabledVisible: boolean
  floatingBallVisible: boolean
  voiceWakeDisabledVisible: boolean
  assistantBlockText: string
  appSetting: PersistedSettingSnapshot | null
}

interface FloatingBallDomSnapshot {
  href: string
  title: string
  readyState: string
  text: string
  hasFloatingBall: boolean
  hasVoicePanel: boolean
  titleText: string
  rect: RectSnapshot | null
  windowBounds: RectSnapshot
  activeElementText: string
}

interface VoicePanelDomSnapshot {
  href: string
  title: string
  readyState: string
  text: string
  hasFloatingBall: boolean
  hasVoicePanel: boolean
  hasClipboardImageTranslateButton: boolean
  hasScreenshotTranslateButton: boolean
  rect: RectSnapshot | null
  windowBounds: RectSnapshot
}

interface PersistedSettingSnapshot {
  assistantEnabled: boolean
  floatingBallEnabled: boolean
  voiceWakeEnabled: boolean
  floatingBallPosition: {
    x: number
    y: number
  } | null
}

interface ProbeResult {
  ok: boolean
  checkedAt: string
  packageVersion: string
  appBundle: string
  executablePath: string
  cdpPort: number
  remoteDebuggingUrl: string
  userDataDir: string
  artifactPaths: {
    output: string
    settingsScreenshot: string
    visibleScreenshot: string
    dragPersistScreenshot: string
    voicePanelScreenshot: string
  }
  selectedTargetIds: {
    settings?: string
    floatingBall?: string
    voicePanel?: string
  }
  targets: Array<Pick<DevToolsTarget, 'id' | 'title' | 'type' | 'url'>>
  settingsDom?: SettingsDomSnapshot
  floatingBallBeforeDrag?: FloatingBallDomSnapshot
  floatingBallAfterDrag?: FloatingBallDomSnapshot
  floatingBallAfterRestart?: FloatingBallDomSnapshot
  clickAction?: {
    clicked: boolean
    invokeAvailable: boolean
    invokeSucceeded: boolean
    invokeError?: string
  }
  voicePanelDom?: VoicePanelDomSnapshot
  persistedSetting?: PersistedSettingSnapshot
  evidenceChecks: Record<string, boolean>
  failures: string[]
}

function printUsage(): void {
  console.log(`Usage:
  corepack pnpm -C "apps/core-app" run visible:experience:assistant-floating-ball-probe -- [options]

Options:
  --appBundle <path>       Packaged .app bundle. Default: dist/mac-arm64/tuff.app.
  --port <number>          CDP port. Default: auto-select from 9581.
  --userDataDir <path>     Isolated userData directory. Default: /tmp/tuff-assistant-floating-ball-<timestamp>.
  --outputDir <path>       Evidence output directory. Default: ../../docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18.
  --dateStamp <value>      Artifact date suffix. Default: 2026-06-24.
  --keepUserData           Keep isolated userData after the probe.
  --launchTimeoutMs <ms>   Wait time for CDP endpoint. Default: 30000.
  --compact                Print single-line JSON.
  --help                   Show this help.
`)
}

function parseArgs(argv: string[]): CliOptions | null {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14)
  const options: CliOptions = {
    appBundle: 'dist/mac-arm64/tuff.app',
    cdpPort: 0,
    userDataDir: `/tmp/tuff-assistant-floating-ball-${timestamp}`,
    outputDir: '../../docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18',
    dateStamp: '2026-06-24',
    keepUserData: false,
    pretty: true,
    launchTimeoutMs: 30_000
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') continue
    if (arg === '--help' || arg === '-h') {
      printUsage()
      return null
    }
    if (arg === '--appBundle' && argv[i + 1]) {
      options.appBundle = argv[++i]
      continue
    }
    if (arg === '--port' && argv[i + 1]) {
      const parsed = Number(argv[++i])
      if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid port: ${argv[i]}`)
      options.cdpPort = parsed
      continue
    }
    if (arg === '--userDataDir' && argv[i + 1]) {
      options.userDataDir = argv[++i]
      continue
    }
    if (arg === '--outputDir' && argv[i + 1]) {
      options.outputDir = argv[++i]
      continue
    }
    if (arg === '--dateStamp' && argv[i + 1]) {
      options.dateStamp = argv[++i]
      continue
    }
    if (arg === '--keepUserData') {
      options.keepUserData = true
      continue
    }
    if (arg === '--launchTimeoutMs' && argv[i + 1]) {
      const parsed = Number(argv[++i])
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid launch timeout: ${argv[i]}`)
      }
      options.launchTimeoutMs = Math.floor(parsed)
      continue
    }
    if (arg === '--compact') {
      options.pretty = false
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function resolveCoreAppPath(inputPath: string): string {
  return path.resolve(process.cwd(), inputPath)
}

function resolveExecutablePath(appBundle: string): string {
  return path.resolve(appBundle, 'Contents', 'MacOS', 'tuff')
}

function toRelativeReportPath(absolutePath: string, outputDir: string): string {
  return path.relative(outputDir, absolutePath).replace(/\\/g, '/')
}

function buildArtifactPaths(options: CliOptions): ProbeResult['artifactPaths'] {
  const outputDir = resolveCoreAppPath(options.outputDir)
  return {
    output: path.join(outputDir, `assistant-floating-ball-probe-${options.dateStamp}.json`),
    settingsScreenshot: path.join(
      outputDir,
      `assistant-floating-ball-settings-${options.dateStamp}.png`
    ),
    visibleScreenshot: path.join(
      outputDir,
      `assistant-floating-ball-visible-${options.dateStamp}.png`
    ),
    dragPersistScreenshot: path.join(
      outputDir,
      `assistant-floating-ball-drag-persist-${options.dateStamp}.png`
    ),
    voicePanelScreenshot: path.join(
      outputDir,
      `assistant-voice-panel-open-${options.dateStamp}.png`
    )
  }
}

async function prepareIsolatedUserData(options: CliOptions): Promise<void> {
  await rm(options.userDataDir, { recursive: true, force: true })
  const configDir = path.join(options.userDataDir, 'tuff', 'modules', 'config')
  await mkdir(configDir, { recursive: true })
  await writeFile(
    path.join(configDir, 'app-setting.ini'),
    JSON.stringify({
      beginner: {
        init: true
      },
      dev: {
        advancedSettings: true
      },
      lang: {
        followSystem: false,
        locale: 'zh-CN'
      },
      assistant: {
        name: '阿洛 aler',
        identifier: 'aler',
        enabled: true
      },
      floatingBall: {
        enabled: true,
        size: 56,
        opacity: 1,
        edgePadding: 24,
        position: {
          x: 220,
          y: 220
        }
      },
      voiceWake: {
        enabled: false,
        wakeWords: ['阿洛', 'aler'],
        language: 'zh-CN',
        continuous: true,
        cooldownMs: 2200,
        openPanelOnWake: true
      }
    })
  )
}

function appSettingPath(userDataDir: string): string {
  return path.join(userDataDir, 'tuff', 'modules', 'config', 'app-setting.ini')
}

function normalizePersistedSetting(setting: unknown): PersistedSettingSnapshot | null {
  if (!setting || typeof setting !== 'object') return null
  const record = setting as {
    assistant?: { enabled?: unknown }
    floatingBall?: {
      enabled?: unknown
      position?: { x?: unknown; y?: unknown }
    }
    voiceWake?: { enabled?: unknown }
  }
  const position = record.floatingBall?.position
  return {
    assistantEnabled: record.assistant?.enabled === true,
    floatingBallEnabled: record.floatingBall?.enabled === true,
    voiceWakeEnabled: record.voiceWake?.enabled === true,
    floatingBallPosition:
      position && Number.isFinite(position.x) && Number.isFinite(position.y)
        ? { x: Math.round(Number(position.x)), y: Math.round(Number(position.y)) }
        : null
  }
}

function isValidPersistedSetting(value: unknown): value is PersistedSettingSnapshot {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<PersistedSettingSnapshot>
  return (
    typeof record.assistantEnabled === 'boolean' &&
    typeof record.floatingBallEnabled === 'boolean' &&
    typeof record.voiceWakeEnabled === 'boolean'
  )
}

async function readPersistedSettingFromDisk(
  options: CliOptions
): Promise<PersistedSettingSnapshot | null> {
  try {
    const raw = await readFile(appSettingPath(options.userDataDir), 'utf8')
    return normalizePersistedSetting(JSON.parse(raw))
  } catch {
    return null
  }
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

async function resolveCdpPort(requestedPort: number): Promise<number> {
  if (requestedPort > 0) return requestedPort

  for (let port = 9581; port < 9681; port += 1) {
    if (await isPortAvailable(port)) return port
  }

  throw new Error('Unable to find an available CDP port in range 9581-9680')
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function loadTargets(remoteDebuggingUrl: string): Promise<DevToolsTarget[]> {
  const response = await fetch(remoteDebuggingUrl)
  if (!response.ok) throw new Error(`Remote debugging endpoint returned HTTP ${response.status}`)
  const payload = (await response.json()) as unknown
  if (!Array.isArray(payload))
    throw new Error('Remote debugging endpoint did not return a target list')
  return payload.filter(isDevToolsTarget)
}

function isDevToolsTarget(value: unknown): value is DevToolsTarget {
  if (!value || typeof value !== 'object') return false
  const target = value as Partial<DevToolsTarget>
  return (
    typeof target.id === 'string' &&
    typeof target.title === 'string' &&
    typeof target.type === 'string' &&
    typeof target.url === 'string'
  )
}

async function waitForTargets(
  remoteDebuggingUrl: string,
  timeoutMs: number
): Promise<DevToolsTarget[]> {
  const startedAt = Date.now()
  let lastError: unknown
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const targets = await loadTargets(remoteDebuggingUrl)
      if (targets.length > 0) return targets
    } catch (error) {
      lastError = error
    }
    await sleep(500)
  }
  throw new Error(
    `Timed out waiting for CDP endpoint ${remoteDebuggingUrl}: ${
      lastError instanceof Error ? lastError.message : String(lastError ?? 'no targets')
    }`
  )
}

async function withTarget<T>(
  target: DevToolsTarget,
  callback: (send: CdpSend) => Promise<T>
): Promise<T> {
  if (!target.webSocketDebuggerUrl) throw new Error(`Target has no WebSocket URL: ${target.id}`)

  const socket = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map<
    number,
    {
      resolve: (value: CdpResponse) => void
      reject: (error: Error) => void
      timeout: ReturnType<typeof setTimeout>
    }
  >()

  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as CdpResponse & { id?: number }
    if (typeof message.id === 'number' && pending.has(message.id)) {
      const entry = pending.get(message.id)
      pending.delete(message.id)
      if (!entry) return
      clearTimeout(entry.timeout)
      if (message.error) {
        entry.reject(
          new Error(message.error.message ?? `CDP command failed for target ${target.id}`)
        )
        return
      }
      entry.resolve(message)
    }
  }

  const rejectPending = (error: Error) => {
    for (const [requestId, entry] of pending.entries()) {
      clearTimeout(entry.timeout)
      entry.reject(error)
      pending.delete(requestId)
    }
  }

  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve()
    socket.onerror = () => reject(new Error(`Failed to connect CDP target: ${target.id}`))
  })

  const send: CdpSend = (method, params = {}) => {
    if (socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`CDP target socket is not open: ${target.id}`))
    }
    return new Promise((resolve, reject) => {
      const nextId = ++id
      const timeout = setTimeout(() => {
        pending.delete(nextId)
        reject(new Error(`Timed out waiting for CDP ${method} on target ${target.id}`))
      }, 12_000)
      pending.set(nextId, { resolve, reject, timeout })
      socket.send(JSON.stringify({ id: nextId, method, params }))
    })
  }

  try {
    socket.onerror = () => rejectPending(new Error(`CDP target socket errored: ${target.id}`))
    socket.onclose = () => rejectPending(new Error(`CDP target socket closed: ${target.id}`))
    await send('Runtime.enable')
    await send('Page.enable')
    return await callback(send)
  } finally {
    rejectPending(new Error(`CDP target socket closed: ${target.id}`))
    socket.close()
  }
}

async function evaluate<T>(send: CdpSend, expression: string, timeoutMs = 15_000): Promise<T> {
  const response = await Promise.race([
    send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    }),
    sleep(timeoutMs).then(() => {
      throw new Error('Timed out waiting for CDP Runtime.evaluate')
    })
  ])
  return response.result?.result?.value as T
}

async function captureScreenshot(target: DevToolsTarget, outputPath: string): Promise<void> {
  await withTarget(target, async (send) => {
    const response = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true
    })
    const data = response.result?.data
    if (typeof data !== 'string' || data.length === 0) {
      throw new Error('CDP screenshot response did not include data')
    }
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, Buffer.from(data, 'base64'))
  })
}

function inspectSettingsExpression(): string {
  return `(() => {
    const textOf = (node) => (node?.textContent || '').replace(/\\s+/g, ' ').trim()
    const readAppSetting = () => {
      const setting = window.__talex_touch_storage_singletons__?.get?.('storage:app-setting.ini')?.data
      if (!setting) return null
      const position = setting.floatingBall?.position
      return {
        assistantEnabled: setting.assistant?.enabled === true,
        floatingBallEnabled: setting.floatingBall?.enabled === true,
        voiceWakeEnabled: setting.voiceWake?.enabled === true,
        floatingBallPosition: position && Number.isFinite(position.x) && Number.isFinite(position.y)
          ? { x: Math.round(position.x), y: Math.round(position.y) }
          : null
      }
    }
    const blocks = Array.from(document.querySelectorAll('.TBlockSlot-Container, [class*="TBlockSlot"], section, div'))
    const assistantBlock = blocks.find((element) => {
      const text = textOf(element)
      return (
        (text.includes('智能助手') || text.includes('Assistant')) &&
        (text.includes('显示悬浮球') || text.includes('floating ball')) &&
        (text.includes('语音唤醒') || text.includes('Voice wake'))
      )
    }) || document.querySelector('.AppSettings-Container')
    const root = assistantBlock || document.body
    const rootText = textOf(root)
    const text = document.body?.innerText || ''
    const appSetting = readAppSetting()
    return {
      href: location.href,
      title: document.title,
      readyState: document.readyState,
      text: text.slice(0, 5000),
      hasSettingsShell: Boolean(document.querySelector('.AppSettings-Container')),
      hasFloatingBall: Boolean(document.querySelector('.floating-ball-root')),
      hasVoicePanel: Boolean(document.querySelector('.voice-panel-root')),
      assistantEnabledVisible: (
        (
          rootText.includes('启用 Assistant') ||
          rootText.includes('启用助手') ||
          rootText.includes('Enable Assistant')
        ) &&
        appSetting?.assistantEnabled === true
      ),
      floatingBallVisible: (
        (rootText.includes('显示悬浮球') || rootText.includes('Show floating ball')) &&
        appSetting?.floatingBallEnabled === true
      ),
      voiceWakeDisabledVisible: (
        (rootText.includes('语音唤醒') || rootText.includes('Voice wake')) &&
        appSetting?.voiceWakeEnabled === false
      ),
      assistantBlockText: rootText.slice(0, 2000),
      appSetting
    }
  })()`
}

function inspectFloatingBallExpression(): string {
  return `(() => {
    const root = document.querySelector('.floating-ball-root')
    const rect = root?.getBoundingClientRect()
    return {
      href: location.href,
      title: document.title,
      readyState: document.readyState,
      text: document.body?.innerText?.slice(0, 2000) || '',
      hasFloatingBall: Boolean(root),
      hasVoicePanel: Boolean(document.querySelector('.voice-panel-root')),
      titleText: root?.querySelector('.floating-ball')?.getAttribute('title') || '',
      rect: rect ? {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      } : null,
      windowBounds: {
        left: Math.round(window.screenX),
        top: Math.round(window.screenY),
        width: Math.round(window.outerWidth || rect?.width || 0),
        height: Math.round(window.outerHeight || rect?.height || 0)
      },
      activeElementText: document.activeElement?.textContent?.slice(0, 200) || ''
    }
  })()`
}

function inspectVoicePanelExpression(): string {
  return `(() => {
    const root = document.querySelector('.voice-panel-root')
    const rect = root?.getBoundingClientRect()
    const buttons = Array.from(document.querySelectorAll('button'))
    const hasClipboard = buttons.some((button) => {
      const text = button.textContent || ''
      return (
        text.includes('翻译剪贴板图片') ||
        text.includes('剪贴板图片翻译') ||
        text.includes('Translate clipboard image')
      )
    })
    const hasScreenshot = buttons.some((button) => {
      const text = button.textContent || ''
      return (
        text.includes('截图翻译') ||
        text.includes('截图并翻译') ||
        text.includes('Translate screenshot') ||
        text.includes('Screenshot and translate')
      )
    })
    return {
      href: location.href,
      title: document.title,
      readyState: document.readyState,
      text: document.body?.innerText?.slice(0, 3000) || '',
      hasFloatingBall: Boolean(document.querySelector('.floating-ball-root')),
      hasVoicePanel: Boolean(root),
      hasClipboardImageTranslateButton: hasClipboard,
      hasScreenshotTranslateButton: hasScreenshot,
      rect: rect ? {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      } : null,
      windowBounds: {
        left: Math.round(window.screenX),
        top: Math.round(window.screenY),
        width: Math.round(window.outerWidth || rect?.width || 0),
        height: Math.round(window.outerHeight || rect?.height || 0)
      }
    }
  })()`
}

function routeSettingsExpression(): string {
  return `(() => {
    if (window.__VUE_ROUTER__?.push) {
      window.__VUE_ROUTER__.push({ path: '/setting', query: { section: 'assistant' } }).catch(() => undefined)
    } else {
      location.hash = '#/setting?section=assistant'
    }
    return {
      href: location.href,
      text: document.body?.innerText?.slice(0, 1000) || ''
    }
  })()`
}

function dragFloatingBallExpression(deltaX: number, deltaY: number): string {
  return `(async () => {
    const root = document.querySelector('.floating-ball-root')
    if (!(root instanceof HTMLElement)) return { dragged: false, reason: 'floating-ball-not-found' }
    const rect = root.getBoundingClientRect()
    const startClientX = Math.round(rect.left + rect.width / 2)
    const startClientY = Math.round(rect.top + rect.height / 2)
    const startScreenX = Math.round(window.screenX + startClientX)
    const startScreenY = Math.round(window.screenY + startClientY)
    const endScreenX = startScreenX + ${Math.round(deltaX)}
    const endScreenY = startScreenY + ${Math.round(deltaY)}
    const dispatch = (type, screenX, screenY) => {
      const clientX = screenX - window.screenX
      const clientY = screenY - window.screenY
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        buttons: type === 'mouseup' ? 0 : 1,
        clientX,
        clientY,
        screenX,
        screenY
      })
      ;(type === 'mousedown' ? root : window).dispatchEvent(event)
    }
    dispatch('mousedown', startScreenX, startScreenY)
    await new Promise((resolve) => setTimeout(resolve, 80))
    for (let step = 1; step <= 8; step += 1) {
      const screenX = Math.round(startScreenX + (${Math.round(deltaX)} * step) / 8)
      const screenY = Math.round(startScreenY + (${Math.round(deltaY)} * step) / 8)
      dispatch('mousemove', screenX, screenY)
      await new Promise((resolve) => setTimeout(resolve, 35))
    }
    dispatch('mouseup', endScreenX, endScreenY)
    await new Promise((resolve) => setTimeout(resolve, 650))
    const after = root.getBoundingClientRect()
    return {
      dragged: true,
      before: {
        screenX: Math.round(window.screenX),
        screenY: Math.round(window.screenY),
        left: Math.round(rect.left),
        top: Math.round(rect.top)
      },
      after: {
        screenX: Math.round(window.screenX),
        screenY: Math.round(window.screenY),
        left: Math.round(after.left),
        top: Math.round(after.top)
      }
    }
  })()`
}

function clickFloatingBallExpression(): string {
  return `(async () => {
    const root = document.querySelector('.floating-ball-root')
    if (!(root instanceof HTMLElement)) {
      return {
        clicked: false,
        invokeAvailable: false,
        invokeSucceeded: false,
        invokeError: 'floating-ball-not-found'
      }
    }
    const rect = root.getBoundingClientRect()
    const clientX = Math.round(rect.left + rect.width / 2)
    const clientY = Math.round(rect.top + rect.height / 2)
    const eventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: 0,
      clientX,
      clientY,
      screenX: Math.round(window.screenX + clientX),
      screenY: Math.round(window.screenY + clientY)
    }
    root.dispatchEvent(new MouseEvent('mousedown', { ...eventInit, buttons: 1 }))
    root.dispatchEvent(new MouseEvent('mouseup', eventInit))
    root.dispatchEvent(new MouseEvent('click', eventInit))
    const invoke = window.electron?.ipcRenderer?.invoke?.bind(window.electron.ipcRenderer)
    let invokeSucceeded = false
    let invokeError = undefined
    if (invoke) {
      try {
        await Promise.race([
          invoke('assistant:floating-ball:open-voice-panel', { source: 'click' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('ipc-invoke-timeout')), 1500))
        ])
        invokeSucceeded = true
      } catch (error) {
        invokeError = error instanceof Error ? error.message : String(error)
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1800))
    return { clicked: true, invokeAvailable: Boolean(invoke), invokeSucceeded, invokeError }
  })()`
}

function readPersistedSettingExpression(): string {
  return `(async () => {
    const setting = window.__talex_touch_storage_singletons__?.get?.('storage:app-setting.ini')?.data
    if (!setting) return null
    const position = setting?.floatingBall?.position
    return {
      assistantEnabled: setting?.assistant?.enabled === true,
      floatingBallEnabled: setting?.floatingBall?.enabled === true,
      voiceWakeEnabled: setting?.voiceWake?.enabled === true,
      floatingBallPosition: position && Number.isFinite(position.x) && Number.isFinite(position.y)
        ? { x: Math.round(position.x), y: Math.round(position.y) }
        : null
    }
  })()`
}

async function pickSettingsTarget(
  remoteDebuggingUrl: string,
  timeoutMs: number
): Promise<{
  target: DevToolsTarget | undefined
  targets: DevToolsTarget[]
  dom?: SettingsDomSnapshot
}> {
  const startedAt = Date.now()
  let latestTargets: DevToolsTarget[] = []

  while (Date.now() - startedAt < timeoutMs) {
    latestTargets = await loadTargets(remoteDebuggingUrl).catch(() => [])
    const pageTargets = latestTargets.filter(isRendererTarget)

    for (const target of pageTargets) {
      try {
        const snapshot = await withTarget(target, async (send) => {
          await evaluate(send, routeSettingsExpression(), 5000)
          await sleep(1400)
          return await evaluate<SettingsDomSnapshot>(send, inspectSettingsExpression(), 5000)
        })
        if (
          snapshot.hasSettingsShell &&
          !snapshot.hasFloatingBall &&
          !snapshot.hasVoicePanel &&
          (snapshot.text.includes('应用设置') ||
            snapshot.text.includes('App Settings') ||
            snapshot.assistantBlockText.includes('智能助手') ||
            snapshot.assistantBlockText.includes('Assistant'))
        ) {
          return { target, targets: latestTargets, dom: snapshot }
        }
      } catch {
        // Skip renderer targets that are still booting or not interactive.
      }
    }

    await sleep(750)
  }

  return { target: undefined, targets: latestTargets }
}

async function findFloatingBallTarget(
  remoteDebuggingUrl: string,
  timeoutMs: number
): Promise<{ target: DevToolsTarget | undefined; dom?: FloatingBallDomSnapshot }> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const targets = await loadTargets(remoteDebuggingUrl).catch(() => [])
    const pageTargets = targets.filter(isLikelyAssistantWindowTarget)
    for (const target of pageTargets) {
      try {
        const dom = await withTarget(target, (send) =>
          evaluate<FloatingBallDomSnapshot>(send, inspectFloatingBallExpression(), 5000)
        )
        if (
          dom.hasFloatingBall &&
          !dom.hasVoicePanel &&
          dom.windowBounds.width <= 96 &&
          dom.windowBounds.height <= 96
        ) {
          return { target, dom }
        }
      } catch {
        // Continue searching other targets while assistant windows boot.
      }
    }
    await sleep(500)
  }
  return { target: undefined }
}

async function findVoicePanelTarget(
  remoteDebuggingUrl: string,
  timeoutMs: number
): Promise<{ target: DevToolsTarget | undefined; dom?: VoicePanelDomSnapshot }> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const targets = await loadTargets(remoteDebuggingUrl).catch(() => [])
    const pageTargets = targets.filter(isLikelyAssistantWindowTarget)
    for (const target of pageTargets) {
      try {
        const dom = await withTarget(target, (send) =>
          evaluate<VoicePanelDomSnapshot>(send, inspectVoicePanelExpression(), 5000)
        )
        if (dom.hasVoicePanel && dom.windowBounds.width >= 260 && dom.windowBounds.height >= 240) {
          return { target, dom }
        }
      } catch {
        // Continue searching other targets while assistant windows boot.
      }
    }
    await sleep(500)
  }
  return { target: undefined }
}

function launchPackagedApp(
  executablePath: string,
  options: CliOptions,
  remoteDebuggingPort: number
): ChildProcess {
  return spawn(executablePath, [`--remote-debugging-port=${remoteDebuggingPort}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      TUFF_STARTUP_BENCHMARK_USER_DATA_DIR: options.userDataDir
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
  })
}

function terminateProcess(child: ChildProcess | null): void {
  if (!child || child.exitCode !== null) return
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // ignore
    }
    setTimeout(() => {
      try {
        process.kill(-child.pid!, 'SIGKILL')
      } catch {
        // ignore
      }
    }, 3000)
    return
  }
  child.kill('SIGTERM')
}

async function terminateProcessAndWait(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null) return

  const pid = child.pid
  terminateProcess(child)

  const exited = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 5000)
    child.once('exit', () => {
      clearTimeout(timeout)
      resolve(true)
    })
  })

  if (exited || !pid) return

  try {
    if (process.platform !== 'win32') process.kill(-pid, 'SIGKILL')
    else process.kill(pid, 'SIGKILL')
  } catch {
    // ignore
  }
}

function rectDistance(
  left: RectSnapshot | null | undefined,
  right: RectSnapshot | null | undefined
): number {
  if (!left || !right) return Number.POSITIVE_INFINITY
  return Math.hypot(left.left - right.left, left.top - right.top)
}

function evaluateEvidenceChecks(
  settingsDom?: SettingsDomSnapshot,
  floatingBallBeforeDrag?: FloatingBallDomSnapshot,
  floatingBallAfterDrag?: FloatingBallDomSnapshot,
  floatingBallAfterRestart?: FloatingBallDomSnapshot,
  voicePanelDom?: VoicePanelDomSnapshot,
  persistedSetting?: PersistedSettingSnapshot
): Record<string, boolean> {
  const beforeRect = floatingBallBeforeDrag?.windowBounds
  const afterDragRect = floatingBallAfterDrag?.windowBounds
  const afterRestartRect = floatingBallAfterRestart?.windowBounds
  const dragDistance = rectDistance(beforeRect, afterDragRect)
  const restartDistance = rectDistance(afterDragRect, afterRestartRect)
  const voicePanelRect = voicePanelDom?.windowBounds
  const settingsSnapshot = isValidPersistedSetting(persistedSetting)
    ? persistedSetting
    : settingsDom?.appSetting

  return {
    settingsAssistantEnabledVoiceWakeDisabled: Boolean(
      settingsDom?.assistantEnabledVisible &&
      settingsDom?.floatingBallVisible &&
      settingsDom?.voiceWakeDisabledVisible &&
      settingsSnapshot?.assistantEnabled === true &&
      settingsSnapshot?.floatingBallEnabled === true &&
      settingsSnapshot?.voiceWakeEnabled === false
    ),
    floatingBallVisibleDoesNotStealFocus: Boolean(
      floatingBallBeforeDrag?.hasFloatingBall &&
      /语音唤醒已关闭|voice wake is off/i.test(
        `${floatingBallBeforeDrag?.text ?? ''} ${floatingBallBeforeDrag?.titleText ?? ''}`
      )
    ),
    draggedPositionPersists: Boolean(
      dragDistance >= 20 &&
      restartDistance <= 16 &&
      settingsSnapshot?.floatingBallPosition &&
      Number.isFinite(settingsSnapshot.floatingBallPosition.x) &&
      Number.isFinite(settingsSnapshot.floatingBallPosition.y)
    ),
    clickOpensVoicePanelBesideBall: Boolean(
      voicePanelDom?.hasVoicePanel &&
      voicePanelDom.hasClipboardImageTranslateButton &&
      voicePanelDom.hasScreenshotTranslateButton &&
      afterRestartRect &&
      voicePanelRect &&
      voicePanelRect.left >= afterRestartRect.left
    )
  }
}

function collectFailures(evidenceChecks: Record<string, boolean>): string[] {
  const failures: string[] = []
  if (!evidenceChecks.settingsAssistantEnabledVoiceWakeDisabled) {
    failures.push(
      'Settings did not prove Assistant enabled, floating ball enabled, and voice wake disabled.'
    )
  }
  if (!evidenceChecks.floatingBallVisibleDoesNotStealFocus) {
    failures.push('Floating ball was not visible with voice wake disabled status text.')
  }
  if (!evidenceChecks.draggedPositionPersists) {
    failures.push('Dragged floating ball position did not persist after packaged app restart.')
  }
  if (!evidenceChecks.clickOpensVoicePanelBesideBall) {
    failures.push('Clicking the floating ball did not open a usable Voice Panel beside the ball.')
  }
  return failures
}

async function inspectSettings(target: DevToolsTarget): Promise<SettingsDomSnapshot> {
  return await withTarget(target, async (send) => {
    await evaluate(send, routeSettingsExpression(), 5000)
    await sleep(500)
    return await evaluate<SettingsDomSnapshot>(send, inspectSettingsExpression(), 5000)
  })
}

async function inspectFloatingBall(target: DevToolsTarget): Promise<FloatingBallDomSnapshot> {
  return await withTarget(target, (send) =>
    evaluate<FloatingBallDomSnapshot>(send, inspectFloatingBallExpression(), 5000)
  )
}

async function inspectVoicePanel(target: DevToolsTarget): Promise<VoicePanelDomSnapshot> {
  return await withTarget(target, (send) =>
    evaluate<VoicePanelDomSnapshot>(send, inspectVoicePanelExpression(), 5000)
  )
}

async function readPersistedSetting(
  target: DevToolsTarget
): Promise<PersistedSettingSnapshot | null> {
  return await withTarget(target, (send) =>
    evaluate<PersistedSettingSnapshot | null>(send, readPersistedSettingExpression(), 5000)
  )
}

async function readBestPersistedSetting(
  options: CliOptions,
  target?: DevToolsTarget
): Promise<PersistedSettingSnapshot | null> {
  const fromDisk = await readPersistedSettingFromDisk(options)
  if (isValidPersistedSetting(fromDisk)) return fromDisk
  if (!target) return null
  const fromRenderer = await readPersistedSetting(target)
  return isValidPersistedSetting(fromRenderer) ? fromRenderer : null
}

async function runProbe(options: CliOptions): Promise<ProbeResult> {
  const cdpPort = await resolveCdpPort(options.cdpPort)
  const remoteDebuggingUrl = `http://127.0.0.1:${cdpPort}/json/list`
  const appBundle = resolveCoreAppPath(options.appBundle)
  const executablePath = resolveExecutablePath(appBundle)
  const artifactPaths = buildArtifactPaths(options)
  const reportOutputDir = resolveCoreAppPath(options.outputDir)
  const result: ProbeResult = {
    ok: false,
    checkedAt: new Date().toISOString(),
    packageVersion: packageJson.version,
    appBundle,
    executablePath,
    cdpPort,
    remoteDebuggingUrl,
    userDataDir: options.userDataDir,
    artifactPaths,
    selectedTargetIds: {},
    targets: [],
    evidenceChecks: {},
    failures: []
  }

  await mkdir(reportOutputDir, { recursive: true })
  await prepareIsolatedUserData(options)

  let child: ChildProcess | null = null
  try {
    child = launchPackagedApp(executablePath, options, cdpPort)
    child.stdout?.on('data', () => undefined)
    child.stderr?.on('data', () => undefined)

    await waitForTargets(remoteDebuggingUrl, options.launchTimeoutMs)
    const settingsPick = await pickSettingsTarget(remoteDebuggingUrl, options.launchTimeoutMs)
    result.targets = settingsPick.targets.map((target) => ({
      id: target.id,
      title: target.title,
      type: target.type,
      url: target.url
    }))
    if (!settingsPick.target) {
      result.failures.push('Interactive Settings target was not found.')
      result.evidenceChecks = evaluateEvidenceChecks()
      return result
    }
    result.selectedTargetIds.settings = settingsPick.target.id
    result.settingsDom = settingsPick.dom ?? (await inspectSettings(settingsPick.target))
    result.persistedSetting =
      (await readBestPersistedSetting(options, settingsPick.target)) ?? undefined
    await captureScreenshot(settingsPick.target, artifactPaths.settingsScreenshot)

    const floatingPick = await findFloatingBallTarget(remoteDebuggingUrl, options.launchTimeoutMs)
    if (!floatingPick.target) {
      result.failures.push('Assistant floating ball target was not found.')
      result.evidenceChecks = evaluateEvidenceChecks(result.settingsDom)
      return result
    }
    result.selectedTargetIds.floatingBall = floatingPick.target.id
    result.floatingBallBeforeDrag =
      floatingPick.dom ?? (await inspectFloatingBall(floatingPick.target))
    await captureScreenshot(floatingPick.target, artifactPaths.visibleScreenshot)

    await withTarget(floatingPick.target, async (send) => {
      await evaluate(send, dragFloatingBallExpression(96, 72), 10_000)
    })
    result.floatingBallAfterDrag = await inspectFloatingBall(floatingPick.target)
    await sleep(1500)
    result.persistedSetting =
      (await readBestPersistedSetting(options, settingsPick.target)) ?? result.persistedSetting

    await terminateProcessAndWait(child)
    child = launchPackagedApp(executablePath, options, cdpPort)
    await waitForTargets(remoteDebuggingUrl, options.launchTimeoutMs)

    const restartedFloatingPick = await findFloatingBallTarget(
      remoteDebuggingUrl,
      options.launchTimeoutMs
    )
    if (!restartedFloatingPick.target) {
      result.failures.push('Assistant floating ball target was not found after restart.')
      result.evidenceChecks = evaluateEvidenceChecks(
        result.settingsDom,
        result.floatingBallBeforeDrag,
        result.floatingBallAfterDrag,
        undefined,
        undefined,
        result.persistedSetting
      )
      return result
    }

    result.selectedTargetIds.floatingBall = restartedFloatingPick.target.id
    result.floatingBallAfterRestart =
      restartedFloatingPick.dom ?? (await inspectFloatingBall(restartedFloatingPick.target))
    await captureScreenshot(restartedFloatingPick.target, artifactPaths.dragPersistScreenshot)

    result.clickAction = await withTarget(restartedFloatingPick.target, async (send) => {
      return await evaluate<ProbeResult['clickAction']>(send, clickFloatingBallExpression(), 10_000)
    })
    const voicePanelPick = await findVoicePanelTarget(
      remoteDebuggingUrl,
      options.launchTimeoutMs + 5000
    )
    if (voicePanelPick.target) {
      result.selectedTargetIds.voicePanel = voicePanelPick.target.id
      result.voicePanelDom = voicePanelPick.dom ?? (await inspectVoicePanel(voicePanelPick.target))
      await captureScreenshot(voicePanelPick.target, artifactPaths.voicePanelScreenshot)
    }

    const restartedSettingsPick = await pickSettingsTarget(
      remoteDebuggingUrl,
      options.launchTimeoutMs
    )
    if (restartedSettingsPick.target) {
      result.persistedSetting =
        (await readBestPersistedSetting(options, restartedSettingsPick.target)) ??
        result.persistedSetting
    }

    result.evidenceChecks = evaluateEvidenceChecks(
      result.settingsDom,
      result.floatingBallBeforeDrag,
      result.floatingBallAfterDrag,
      result.floatingBallAfterRestart,
      result.voicePanelDom,
      result.persistedSetting
    )
    result.failures.push(...collectFailures(result.evidenceChecks))
    result.ok = result.failures.length === 0
    return result
  } catch (error) {
    result.failures.push(error instanceof Error ? error.message : String(error))
    result.evidenceChecks = evaluateEvidenceChecks(
      result.settingsDom,
      result.floatingBallBeforeDrag,
      result.floatingBallAfterDrag,
      result.floatingBallAfterRestart,
      result.voicePanelDom,
      result.persistedSetting
    )
    result.failures.push(...collectFailures(result.evidenceChecks))
    result.ok = false
    return result
  } finally {
    await terminateProcessAndWait(child)
    if (!options.keepUserData) {
      await rm(options.userDataDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const result = await runProbe(options)
  const reportOutputDir = resolveCoreAppPath(options.outputDir)
  result.artifactPaths = {
    output: toRelativeReportPath(result.artifactPaths.output, reportOutputDir),
    settingsScreenshot: toRelativeReportPath(
      result.artifactPaths.settingsScreenshot,
      reportOutputDir
    ),
    visibleScreenshot: toRelativeReportPath(
      result.artifactPaths.visibleScreenshot,
      reportOutputDir
    ),
    dragPersistScreenshot: toRelativeReportPath(
      result.artifactPaths.dragPersistScreenshot,
      reportOutputDir
    ),
    voicePanelScreenshot: toRelativeReportPath(
      result.artifactPaths.voicePanelScreenshot,
      reportOutputDir
    )
  }

  const outputPath = path.join(reportOutputDir, result.artifactPaths.output)
  const output = `${JSON.stringify(result, null, options.pretty ? 2 : 0)}\n`
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, output, 'utf8')
  process.stdout.write(output)
  if (!result.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
