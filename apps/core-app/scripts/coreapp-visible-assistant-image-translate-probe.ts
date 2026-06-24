#!/usr/bin/env tsx
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
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

interface CdpResponse {
  result?: {
    data?: string
    result?: {
      value?: unknown
    }
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
  text: string
  hasSettingsShell: boolean
  assistantEnabledVisible: boolean
  floatingBallVisible: boolean
  voiceWakeDisabledVisible: boolean
}

interface FloatingBallDomSnapshot {
  text: string
  hasFloatingBall: boolean
  hasVoicePanel: boolean
  windowBounds: RectSnapshot
}

interface VoicePanelDomSnapshot {
  text: string
  hasVoicePanel: boolean
  hasClipboardImageTranslateButton: boolean
  hasScreenshotTranslateButton: boolean
  statusText: string
  errorText: string
  isTranslatingClipboardImage: boolean
  hasTranslateReadyText: boolean
  hasEmptyClipboardHint: boolean
  hasProviderFallbackHint: boolean
  windowBounds: RectSnapshot
}

interface ImageTranslatePinWindowSnapshot {
  href: string
  title: string
  text: string
  hasImageTranslationTitle: boolean
  hasTranslatedImage: boolean
  hasSourceText: boolean
  hasTargetText: boolean
  hasAlwaysOnTopLabel: boolean
  windowBounds: RectSnapshot
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
    translateStartScreenshot: string
    translateResultScreenshot: string
    emptyClipboardScreenshot: string
    providerFallbackScreenshot: string
  }
  selectedTargetIds: Record<string, string | undefined>
  targets: Array<Pick<DevToolsTarget, 'id' | 'title' | 'type' | 'url'>>
  settingsDom?: SettingsDomSnapshot
  floatingBallDom?: FloatingBallDomSnapshot
  voicePanelBeforeTranslate?: VoicePanelDomSnapshot
  voicePanelTranslateStart?: VoicePanelDomSnapshot
  voicePanelEmptyClipboard?: VoicePanelDomSnapshot
  voicePanelProviderFallback?: VoicePanelDomSnapshot
  pinWindowDom?: ImageTranslatePinWindowSnapshot
  evidenceChecks: Record<string, boolean>
  failures: string[]
}

const SOURCE_CLIPBOARD_IMAGE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJYAAABkCAYAAABahOteAAAABmJLR0QA/wD/AP+gvaeTAAAB+klEQVR4nO3cMW7CQBiF4Y+AkS0zgLRHqUsgNuCqyiwAXMHEFhF1Kg1ZkPz8qQySMYu+9dV8JHs8t9sNQOfz+QBALoEEKEEJSEACEpCABKQAAQlIQAISkIAEJCABCZgtgJ/P5/No/bFYDJY8jmN5OuC9SSf4d+/8sd/vY97pZ/h+vxe4S1gEJCABCYpQAhKQgAQkIAEJSEACEpCABCSgAQlIwGwB3m63l9P6fr8X2mmOCZeug/ntH05WsAgIQEACEpSABCQgAQlIQAISkIAEJCABCYgXwbvd7sjOF/t1ToKwUx3qxd4+ATXAZQmLgFQCCVCCEpCABKQAAQlIQAISkIAEJCABCUhAAhKQgAQkILaAv9Xj8fDsIsR6HeuXTyYTLNfg0oq4l3o8RlSgBCQgAQlIQAISkIAEJCABCUhAAhKQgAQkIEEBf3zv34YKxb2xXXa2Wq3CckuQgAQkIAEJSEACEpCABKQAAQlIQAISkIAEJCgCd5PP5+PZRYj1OtYvn06n2W1yIU8WvARlKYmAVAIJUIISkIAEJCABCUhAAhKQgAQkIAEJSEACEpCABCSgAQmIDeC3gCw+Z9Rz+r54aKCdxffycrkc3p8z/xrILJABJCABCUpQAhKQgAQkIAEJSEACEpCABCSggPQC8OVyOVVTKhdzM96cQQISkIAEJCABCUhAAhKQgAQkIAEJSEACEpCABCT4A14dO16KKvAhAAAAAElFTkSuQmCC'

function printUsage(): void {
  console.log(`Usage:
  corepack pnpm -C "apps/core-app" run visible:experience:assistant-image-translate-probe -- [options]

Options:
  --appBundle <path>       Packaged .app bundle. Default: dist/mac-arm64/tuff.app.
  --port <number>          CDP port. Default: auto-select from 9681.
  --userDataDir <path>     Isolated userData directory. Default: /tmp/tuff-assistant-image-translate-<timestamp>.
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
    userDataDir: `/tmp/tuff-assistant-image-translate-${timestamp}`,
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
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid timeout: ${argv[i]}`)
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
    output: path.join(outputDir, `assistant-image-translate-probe-${options.dateStamp}.json`),
    settingsScreenshot: path.join(
      outputDir,
      `assistant-image-translate-settings-${options.dateStamp}.png`
    ),
    translateStartScreenshot: path.join(
      outputDir,
      `assistant-clipboard-image-translate-start-${options.dateStamp}.png`
    ),
    translateResultScreenshot: path.join(
      outputDir,
      `assistant-clipboard-image-translate-result-${options.dateStamp}.png`
    ),
    emptyClipboardScreenshot: path.join(
      outputDir,
      `assistant-clipboard-image-empty-${options.dateStamp}.png`
    ),
    providerFallbackScreenshot: path.join(
      outputDir,
      `assistant-clipboard-image-provider-fallback-${options.dateStamp}.png`
    )
  }
}

async function prepareIsolatedUserData(options: CliOptions): Promise<void> {
  await rm(options.userDataDir, { recursive: true, force: true })
  const configDir = path.join(options.userDataDir, 'tuff', 'modules', 'config')
  await mkdir(configDir, { recursive: true })
  await writeVisibleEvidenceClipboardFile(options)
  await writeFile(
    path.join(configDir, 'app-setting.ini'),
    JSON.stringify({
      beginner: { init: true },
      dev: { advancedSettings: true },
      lang: { followSystem: false, locale: 'zh-CN' },
      assistant: { name: '阿洛 aler', identifier: 'aler', enabled: true },
      floatingBall: {
        enabled: true,
        size: 56,
        opacity: 1,
        edgePadding: 24,
        position: { x: 220, y: 220 }
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
  for (let port = 9681; port < 9781; port += 1) {
    if (await isPortAvailable(port)) return port
  }
  throw new Error('Unable to find an available CDP port in range 9681-9780')
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
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

function isRendererTarget(target: DevToolsTarget): boolean {
  return (
    target.type === 'page' &&
    Boolean(target.webSocketDebuggerUrl) &&
    target.url.includes('/renderer/index.html') &&
    !target.url.includes('/meta-overlay')
  )
}

async function loadTargets(remoteDebuggingUrl: string): Promise<DevToolsTarget[]> {
  const response = await fetch(remoteDebuggingUrl)
  if (!response.ok) throw new Error(`Remote debugging endpoint returned HTTP ${response.status}`)
  const payload = (await response.json()) as unknown
  if (!Array.isArray(payload)) throw new Error('Remote debugging endpoint returned invalid JSON')
  return payload.filter(isDevToolsTarget)
}

async function waitForTargets(remoteDebuggingUrl: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const targets = await loadTargets(remoteDebuggingUrl).catch(() => [])
    if (targets.some((target) => target.webSocketDebuggerUrl)) return
    await sleep(500)
  }
  throw new Error(`Timed out waiting for CDP targets at ${remoteDebuggingUrl}`)
}

async function withTarget<T>(
  target: DevToolsTarget,
  callback: (send: CdpSend) => Promise<T>
): Promise<T> {
  if (!target.webSocketDebuggerUrl) throw new Error(`Target has no WebSocket URL: ${target.id}`)
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map<number, (value: CdpResponse) => void>()

  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as CdpResponse & { id?: number }
    if (typeof message.id === 'number' && pending.has(message.id)) {
      pending.get(message.id)?.(message)
      pending.delete(message.id)
    }
  }

  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve()
    socket.onerror = () => reject(new Error(`Failed to connect CDP target: ${target.id}`))
  })

  const send: CdpSend = (method, params = {}) => {
    return new Promise((resolve) => {
      const nextId = ++id
      pending.set(nextId, resolve)
      socket.send(JSON.stringify({ id: nextId, method, params }))
    })
  }

  try {
    await send('Runtime.enable')
    await send('Page.enable')
    return await callback(send)
  } finally {
    socket.close()
  }
}

async function evaluate<T>(send: CdpSend, expression: string, timeoutMs = 5000): Promise<T> {
  const response = (await Promise.race([
    send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    }),
    new Promise<CdpResponse>((_, reject) =>
      setTimeout(() => reject(new Error('CDP evaluation timed out')), timeoutMs)
    )
  ])) as CdpResponse
  return response.result?.result?.value as T
}

async function captureScreenshot(target: DevToolsTarget, outputPath: string): Promise<void> {
  await withTarget(target, async (send) => {
    const response = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true
    })
    const data = response.result?.data
    if (!data) throw new Error('CDP screenshot response did not include data')
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, Buffer.from(data, 'base64'))
  })
}

function routeSettingsExpression(): string {
  return `(() => {
    if (window.__VUE_ROUTER__?.push) {
      window.__VUE_ROUTER__.push({ path: '/setting', query: { section: 'assistant' } }).catch(() => undefined)
    } else {
      location.hash = '#/setting?section=assistant'
    }
    return true
  })()`
}

function inspectSettingsExpression(): string {
  return `(() => {
    const textOf = (node) => (node?.textContent || '').replace(/\\s+/g, ' ').trim()
    const text = document.body?.innerText || ''
    const setting = window.__talex_touch_storage_singletons__?.get?.('storage:app-setting.ini')?.data
    const rootText = textOf(document.querySelector('.AppSettings-Container') || document.body)
    return {
      href: location.href,
      text: text.slice(0, 4000),
      hasSettingsShell: Boolean(document.querySelector('.AppSettings-Container')),
      assistantEnabledVisible: rootText.includes('启用 Assistant') && setting?.assistant?.enabled === true,
      floatingBallVisible: rootText.includes('显示悬浮球') && setting?.floatingBall?.enabled === true,
      voiceWakeDisabledVisible: rootText.includes('语音唤醒') && setting?.voiceWake?.enabled === false
    }
  })()`
}

function inspectFloatingBallExpression(): string {
  return `(() => {
    const root = document.querySelector('.floating-ball-root')
    const rect = root?.getBoundingClientRect()
    return {
      text: document.body?.innerText?.slice(0, 1000) || '',
      hasFloatingBall: Boolean(root),
      hasVoicePanel: Boolean(document.querySelector('.voice-panel-root')),
      windowBounds: {
        left: Math.round(window.screenX),
        top: Math.round(window.screenY),
        width: Math.round(window.outerWidth || rect?.width || 0),
        height: Math.round(window.outerHeight || rect?.height || 0)
      }
    }
  })()`
}

function inspectVoicePanelExpression(): string {
  return `(() => {
    const root = document.querySelector('.voice-panel-root')
    const rect = root?.getBoundingClientRect()
    const buttons = Array.from(document.querySelectorAll('button'))
    const text = document.body?.innerText || ''
    const statusElement = document.querySelector('.status-text')
    const errorElement = document.querySelector('.error-text')
    return {
      text: text.slice(0, 4000),
      hasVoicePanel: Boolean(root),
      hasClipboardImageTranslateButton: buttons.some((button) => /翻译剪贴板图片|剪贴板图片翻译|Translate clipboard image/.test(button.textContent || '')),
      hasScreenshotTranslateButton: buttons.some((button) => /截图翻译|截图并翻译|Translate screenshot|Screenshot and translate/.test(button.textContent || '')),
      statusText: statusElement?.textContent?.trim() || '',
      errorText: errorElement?.textContent?.trim() || '',
      isTranslatingClipboardImage: /正在翻译剪贴板图片|Translating the clipboard image|翻译中|Translating/.test(text),
      hasTranslateReadyText: /剪贴板图片翻译已打开|Clipboard image translation is open|翻译已打开/.test(text),
      hasEmptyClipboardHint: /未获取到可翻译的剪贴板图片|No translatable clipboard image/.test(text),
      hasProviderFallbackHint: /图片翻译服务暂不可用|Image translation service is unavailable|provider/i.test(text),
      windowBounds: {
        left: Math.round(window.screenX),
        top: Math.round(window.screenY),
        width: Math.round(window.outerWidth || rect?.width || 0),
        height: Math.round(window.outerHeight || rect?.height || 0)
      }
    }
  })()`
}

function inspectImageTranslatePinWindowExpression(): string {
  return `(() => {
    const text = document.body?.innerText || ''
    const image = document.querySelector('img[alt="Translated image"]')
    return {
      href: location.href,
      title: document.title,
      text: text.slice(0, 3000),
      hasImageTranslationTitle: /Image Translation/.test(text) || document.title === 'Image Translation',
      hasTranslatedImage: Boolean(image),
      hasSourceText: /Source/.test(text) && /Visible evidence clipboard image/.test(text),
      hasTargetText: /Target/.test(text) && /可见证据剪贴板图片/.test(text),
      hasAlwaysOnTopLabel: /Always on Top/.test(text),
      windowBounds: {
        left: Math.round(window.screenX),
        top: Math.round(window.screenY),
        width: Math.round(window.outerWidth || 0),
        height: Math.round(window.outerHeight || 0)
      }
    }
  })()`
}

function clickFloatingBallExpression(): string {
  return `(async () => {
    const root = document.querySelector('.floating-ball-root')
    if (!(root instanceof HTMLElement)) return { clicked: false, invokeAvailable: false, invokeSucceeded: false, invokeError: 'floating-ball-not-found' }
    root.click()
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
    await new Promise((resolve) => setTimeout(resolve, 1600))
    return { clicked: true, invokeAvailable: Boolean(invoke), invokeSucceeded, invokeError }
  })()`
}

function clickClipboardTranslateButtonExpression(): string {
  return `(async () => {
    const button = Array.from(document.querySelectorAll('button')).find((item) =>
      /翻译剪贴板图片|剪贴板图片翻译|Translate clipboard image/.test(item.textContent || '')
    )
    if (!(button instanceof HTMLElement)) return { clicked: false, reason: 'button-not-found' }
    button.click()
    await new Promise((resolve) => setTimeout(resolve, 220))
    return { clicked: true }
  })()`
}

function decodeDataUrlPayload(dataUrl: string): Buffer {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) throw new Error('Invalid source clipboard image data URL')
  return Buffer.from(dataUrl.slice(commaIndex + 1), 'base64')
}

async function writeVisibleEvidenceClipboardFile(options: CliOptions): Promise<string> {
  const sourcePath = path.join(options.userDataDir, 'assistant-visible-clipboard-source.png')
  await mkdir(path.dirname(sourcePath), { recursive: true })
  await writeFile(sourcePath, decodeDataUrlPayload(SOURCE_CLIPBOARD_IMAGE_DATA_URL))
  return sourcePath
}

async function execFileAsync(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile(command, args, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message))
        return
      }
      resolve()
    })
  })
}

async function pickSettingsTarget(
  remoteDebuggingUrl: string,
  timeoutMs: number
): Promise<{ target?: DevToolsTarget; targets: DevToolsTarget[]; dom?: SettingsDomSnapshot }> {
  const startedAt = Date.now()
  let latestTargets: DevToolsTarget[] = []
  while (Date.now() - startedAt < timeoutMs) {
    latestTargets = await loadTargets(remoteDebuggingUrl).catch(() => [])
    for (const target of latestTargets.filter(isRendererTarget)) {
      try {
        const dom = await withTarget(target, async (send) => {
          await evaluate(send, routeSettingsExpression(), 5000)
          await sleep(1400)
          return await evaluate<SettingsDomSnapshot>(send, inspectSettingsExpression(), 5000)
        })
        if (dom.hasSettingsShell) return { target, targets: latestTargets, dom }
      } catch {
        // Skip booting renderer targets.
      }
    }
    await sleep(750)
  }
  return { targets: latestTargets }
}

async function findFloatingBallTarget(
  remoteDebuggingUrl: string,
  timeoutMs: number
): Promise<{ target?: DevToolsTarget; dom?: FloatingBallDomSnapshot }> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const targets = await loadTargets(remoteDebuggingUrl).catch(() => [])
    for (const target of targets.filter(isRendererTarget)) {
      try {
        const dom = await withTarget(target, (send) =>
          evaluate<FloatingBallDomSnapshot>(send, inspectFloatingBallExpression(), 5000)
        )
        if (dom.hasFloatingBall && !dom.hasVoicePanel && dom.windowBounds.width <= 96) {
          return { target, dom }
        }
      } catch {
        // Continue.
      }
    }
    await sleep(500)
  }
  return {}
}

async function findVoicePanelTarget(
  remoteDebuggingUrl: string,
  timeoutMs: number
): Promise<{ target?: DevToolsTarget; dom?: VoicePanelDomSnapshot }> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const targets = await loadTargets(remoteDebuggingUrl).catch(() => [])
    for (const target of targets.filter(isRendererTarget)) {
      try {
        const dom = await withTarget(target, (send) =>
          evaluate<VoicePanelDomSnapshot>(send, inspectVoicePanelExpression(), 5000)
        )
        if (dom.hasVoicePanel && dom.hasClipboardImageTranslateButton) return { target, dom }
      } catch {
        // Continue.
      }
    }
    await sleep(500)
  }
  return {}
}

async function findImageTranslatePinWindowTarget(
  remoteDebuggingUrl: string,
  timeoutMs: number
): Promise<{ target?: DevToolsTarget; dom?: ImageTranslatePinWindowSnapshot }> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const targets = await loadTargets(remoteDebuggingUrl).catch(() => [])
    for (const target of targets.filter(
      (item) => item.type === 'page' && item.webSocketDebuggerUrl
    )) {
      try {
        const dom = await withTarget(target, (send) =>
          evaluate<ImageTranslatePinWindowSnapshot>(
            send,
            inspectImageTranslatePinWindowExpression(),
            5000
          )
        )
        if (dom.hasImageTranslationTitle && dom.hasTranslatedImage && dom.hasTargetText) {
          return { target, dom }
        }
      } catch {
        // Continue.
      }
    }
    await sleep(500)
  }
  return {}
}

async function writeClipboardImage(options: CliOptions): Promise<void> {
  const sourcePath = await writeVisibleEvidenceClipboardFile(options)
  await execFileAsync('osascript', [
    '-e',
    `set imageFile to POSIX file ${JSON.stringify(sourcePath)}`,
    '-e',
    'set the clipboard to (read imageFile as «class PNGf»)'
  ])
  await sleep(500)
}

async function clearClipboard(options?: CliOptions): Promise<void> {
  if (options) {
    await rm(path.join(options.userDataDir, 'assistant-visible-clipboard-source.png'), {
      force: true
    }).catch(() => undefined)
  }
  await execFileAsync('osascript', ['-e', 'set the clipboard to ""'])
  await sleep(500)
}

async function clickClipboardTranslateButton(target: DevToolsTarget): Promise<void> {
  const result = await withTarget(target, (send) =>
    evaluate<{ clicked: boolean; reason?: string }>(
      send,
      clickClipboardTranslateButtonExpression(),
      7000
    )
  )
  if (!result.clicked) throw new Error(result.reason || 'Failed to click clipboard translate')
}

function launchPackagedApp(
  executablePath: string,
  options: CliOptions,
  remoteDebuggingPort: number,
  evidenceTranslateMode: boolean
): ChildProcess {
  return spawn(executablePath, [`--remote-debugging-port=${remoteDebuggingPort}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      TUFF_STARTUP_BENCHMARK_USER_DATA_DIR: options.userDataDir,
      TUFF_VISIBLE_EVIDENCE_ASSISTANT_IMAGE_TRANSLATE: evidenceTranslateMode ? '1' : '0',
      TUFF_VISIBLE_EVIDENCE_ASSISTANT_IMAGE_TRANSLATE_CLIPBOARD_FILE: path.join(
        options.userDataDir,
        'assistant-visible-clipboard-source.png'
      )
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

function evaluateEvidenceChecks(result: ProbeResult): Record<string, boolean> {
  return {
    clipboardImageTranslationStartsFromVoicePanel: Boolean(
      result.voicePanelTranslateStart?.hasVoicePanel &&
      result.voicePanelTranslateStart.hasClipboardImageTranslateButton &&
      (result.voicePanelTranslateStart.isTranslatingClipboardImage ||
        result.voicePanelTranslateStart.hasTranslateReadyText)
    ),
    assistantReadsCurrentClipboardImage: Boolean(
      result.voicePanelBeforeTranslate?.hasClipboardImageTranslateButton &&
      result.pinWindowDom?.hasSourceText &&
      !/截图中|正在截图|Screenshot/.test(result.voicePanelTranslateStart?.text || '')
    ),
    translatedResultAppearsInPinWindow: Boolean(
      result.pinWindowDom?.hasImageTranslationTitle &&
      result.pinWindowDom.hasTranslatedImage &&
      result.pinWindowDom.hasSourceText &&
      result.pinWindowDom.hasTargetText
    ),
    emptyClipboardAndProviderFallbackRecoverable: Boolean(
      result.voicePanelEmptyClipboard?.hasEmptyClipboardHint &&
      result.voicePanelProviderFallback?.hasProviderFallbackHint &&
      result.voicePanelProviderFallback.hasClipboardImageTranslateButton
    )
  }
}

function collectFailures(evidenceChecks: Record<string, boolean>): string[] {
  const failures: string[] = []
  if (!evidenceChecks.clipboardImageTranslationStartsFromVoicePanel) {
    failures.push(
      'Clipboard image translation did not visibly start from the Assistant Voice Panel.'
    )
  }
  if (!evidenceChecks.assistantReadsCurrentClipboardImage) {
    failures.push('Assistant action did not prove it consumed the current clipboard image.')
  }
  if (!evidenceChecks.translatedResultAppearsInPinWindow) {
    failures.push('Translated image result did not appear in the Image Translation pin window.')
  }
  if (!evidenceChecks.emptyClipboardAndProviderFallbackRecoverable) {
    failures.push('Empty clipboard and provider fallback recovery hints were not both visible.')
  }
  return failures
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
    child = launchPackagedApp(executablePath, options, cdpPort, true)
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
      result.evidenceChecks = evaluateEvidenceChecks(result)
      return result
    }
    result.selectedTargetIds.settings = settingsPick.target.id
    result.settingsDom = settingsPick.dom
    await captureScreenshot(settingsPick.target, artifactPaths.settingsScreenshot)

    const floatingPick = await findFloatingBallTarget(remoteDebuggingUrl, options.launchTimeoutMs)
    if (!floatingPick.target) {
      result.failures.push('Assistant floating ball target was not found.')
      result.evidenceChecks = evaluateEvidenceChecks(result)
      return result
    }
    result.selectedTargetIds.floatingBall = floatingPick.target.id
    result.floatingBallDom = floatingPick.dom

    await withTarget(floatingPick.target, (send) =>
      evaluate(send, clickFloatingBallExpression(), 8000)
    )
    const voicePanelPick = await findVoicePanelTarget(
      remoteDebuggingUrl,
      options.launchTimeoutMs + 5000
    )
    if (!voicePanelPick.target) {
      result.failures.push('Assistant Voice Panel target was not found.')
      result.evidenceChecks = evaluateEvidenceChecks(result)
      return result
    }
    result.selectedTargetIds.voicePanel = voicePanelPick.target.id
    result.voicePanelBeforeTranslate = voicePanelPick.dom

    await writeClipboardImage(options)
    await clickClipboardTranslateButton(voicePanelPick.target)
    result.voicePanelTranslateStart = await withTarget(voicePanelPick.target, (send) =>
      evaluate<VoicePanelDomSnapshot>(send, inspectVoicePanelExpression(), 5000)
    )
    await captureScreenshot(voicePanelPick.target, artifactPaths.translateStartScreenshot)

    const pinWindowPick = await findImageTranslatePinWindowTarget(
      remoteDebuggingUrl,
      options.launchTimeoutMs + 5000
    )
    if (pinWindowPick.target) {
      result.selectedTargetIds.imageTranslatePinWindow = pinWindowPick.target.id
      result.pinWindowDom = pinWindowPick.dom
      await captureScreenshot(pinWindowPick.target, artifactPaths.translateResultScreenshot)
    }

    await clearClipboard(options)
    await clickClipboardTranslateButton(voicePanelPick.target)
    await sleep(1200)
    result.voicePanelEmptyClipboard = await withTarget(voicePanelPick.target, (send) =>
      evaluate<VoicePanelDomSnapshot>(send, inspectVoicePanelExpression(), 5000)
    )
    await captureScreenshot(voicePanelPick.target, artifactPaths.emptyClipboardScreenshot)

    await terminateProcessAndWait(child)
    child = launchPackagedApp(executablePath, options, cdpPort, false)
    await waitForTargets(remoteDebuggingUrl, options.launchTimeoutMs)
    const fallbackFloatingPick = await findFloatingBallTarget(
      remoteDebuggingUrl,
      options.launchTimeoutMs
    )
    if (fallbackFloatingPick.target) {
      await withTarget(fallbackFloatingPick.target, (send) =>
        evaluate(send, clickFloatingBallExpression(), 8000)
      )
      const fallbackVoicePanelPick = await findVoicePanelTarget(
        remoteDebuggingUrl,
        options.launchTimeoutMs + 5000
      )
      if (fallbackVoicePanelPick.target) {
        result.selectedTargetIds.providerFallbackVoicePanel = fallbackVoicePanelPick.target.id
        await writeClipboardImage(options)
        await clickClipboardTranslateButton(fallbackVoicePanelPick.target)
        await sleep(1600)
        result.voicePanelProviderFallback = await withTarget(
          fallbackVoicePanelPick.target,
          (send) => evaluate<VoicePanelDomSnapshot>(send, inspectVoicePanelExpression(), 5000)
        )
        await captureScreenshot(
          fallbackVoicePanelPick.target,
          artifactPaths.providerFallbackScreenshot
        )
      } else {
        result.failures.push('Assistant Voice Panel target was not found for provider fallback.')
      }
    } else {
      result.failures.push('Assistant floating ball target was not found for provider fallback.')
    }

    result.evidenceChecks = evaluateEvidenceChecks(result)
    result.failures.push(...collectFailures(result.evidenceChecks))
    result.ok = result.failures.length === 0
    return result
  } catch (error) {
    result.failures.push(error instanceof Error ? error.message : String(error))
    result.evidenceChecks = evaluateEvidenceChecks(result)
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
    translateStartScreenshot: toRelativeReportPath(
      result.artifactPaths.translateStartScreenshot,
      reportOutputDir
    ),
    translateResultScreenshot: toRelativeReportPath(
      result.artifactPaths.translateResultScreenshot,
      reportOutputDir
    ),
    emptyClipboardScreenshot: toRelativeReportPath(
      result.artifactPaths.emptyClipboardScreenshot,
      reportOutputDir
    ),
    providerFallbackScreenshot: toRelativeReportPath(
      result.artifactPaths.providerFallbackScreenshot,
      reportOutputDir
    )
  }

  const outputJson = JSON.stringify(result, null, options.pretty ? 2 : 0)
  const outputPath = path.resolve(reportOutputDir, result.artifactPaths.output)
  await writeFile(outputPath, outputJson)
  process.stdout.write(`${outputJson}\n`)
  process.exitCode = result.ok ? 0 : 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
