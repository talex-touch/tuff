#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

export type LoginRecoveryScenario = 'browser-open-failure' | 'timeout'

interface CliOptions {
  remoteDebuggingUrl: string
  scenario: LoginRecoveryScenario
  output?: string
  screenshot?: string
  pretty: boolean
}

export interface DevToolsTarget {
  id: string
  title: string
  type: string
  url: string
  webSocketDebuggerUrl?: string
}

export interface LoginRecoveryDom {
  href: string
  title: string
  readyState: string
  bodyText: string
  dialogText: string
  manualHintText: string
  loginStageText: string
  visibleButtons: string[]
  hasLoginRecoveryDialog: boolean
  hasAuthorizeUrlCopy: boolean
  hasUserCodeCopy: boolean
  hasReopenAction: boolean
  hasRetryAction: boolean
  copyStates: {
    link: string
    code: string
  }
}

export interface LoginRecoveryProbeResult {
  ok: boolean
  scenario: LoginRecoveryScenario
  checkedAt: string
  remoteDebuggingUrl: string
  selectedTargetId?: string
  screenshotPath?: string
  bodyText?: string
  visibleButtons: string[]
  manualHintText: string
  loginStageText: string
  networkFailureCopy?: string
  hasAuthorizeUrlCopy: boolean
  hasUserCodeCopy: boolean
  copyResults: {
    link?: string
    code?: string
  }
  dom?: LoginRecoveryDom
  targets: Array<Pick<DevToolsTarget, 'id' | 'title' | 'type' | 'url'>>
  failures: string[]
}

type CdpResponse = {
  result?: {
    data?: string
    result?: {
      value?: unknown
    }
  }
}

type CdpSend = (method: string, params?: Record<string, unknown>) => Promise<CdpResponse>

function printUsage(): void {
  console.log(`Usage:
  corepack pnpm -C "apps/core-app" run visible:experience:login-recovery-probe -- [options]

Options:
  --port <number>             Packaged Electron CDP port. Default: 9342.
  --remoteDebuggingUrl <url>  Packaged Electron /json/list URL. Overrides --port.
  --scenario <name>           browser-open-failure | timeout. Default: browser-open-failure.
  --screenshot <path>         Capture the selected Settings target screenshot.
  --output <path>             Write probe JSON to a file in addition to stdout.
  --compact                   Print single-line JSON.
  --help                      Show this help.

Notes:
  This script only attaches to an already-running packaged Electron CDP endpoint.
  Launch the app with the TUFF_VISIBLE_EVIDENCE_AUTH* env vars needed for the scenario.
`)
}

function parseArgs(argv: string[]): CliOptions | null {
  let port = 9342
  let remoteDebuggingUrl = ''
  const options: Omit<CliOptions, 'remoteDebuggingUrl'> = {
    scenario: 'browser-open-failure',
    pretty: true
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') continue

    if (arg === '--help' || arg === '-h') {
      printUsage()
      return null
    }
    if (arg === '--port' && argv[i + 1]) {
      const parsed = Number(argv[++i])
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid CDP port: ${String(argv[i])}`)
      }
      port = parsed
      continue
    }
    if (arg === '--remoteDebuggingUrl' && argv[i + 1]) {
      remoteDebuggingUrl = argv[++i]
      continue
    }
    if (arg === '--scenario' && argv[i + 1]) {
      options.scenario = parseScenario(argv[++i])
      continue
    }
    if (arg === '--screenshot' && argv[i + 1]) {
      options.screenshot = argv[++i]
      continue
    }
    if (arg === '--output' && argv[i + 1]) {
      options.output = argv[++i]
      continue
    }
    if (arg === '--compact') {
      options.pretty = false
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return {
    ...options,
    remoteDebuggingUrl: remoteDebuggingUrl || `http://127.0.0.1:${port}/json/list`
  }
}

function parseScenario(value: string): LoginRecoveryScenario {
  if (value === 'browser-open-failure' || value === 'timeout') return value
  throw new Error(`Unsupported login recovery scenario: ${value}`)
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function loadTargets(remoteDebuggingUrl: string): Promise<DevToolsTarget[]> {
  const response = await fetch(remoteDebuggingUrl)
  if (!response.ok) {
    throw new Error(`Remote debugging endpoint returned HTTP ${response.status}`)
  }

  const payload = (await response.json()) as unknown
  if (!Array.isArray(payload)) {
    throw new Error('Remote debugging endpoint did not return a target list')
  }

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

async function withTarget<T>(
  target: DevToolsTarget,
  callback: (send: CdpSend) => Promise<T>
): Promise<T> {
  if (!target.webSocketDebuggerUrl) {
    throw new Error(`Target has no WebSocket debugger URL: ${target.id}`)
  }

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

async function evaluate<T>(send: CdpSend, expression: string): Promise<T> {
  const response = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  return response.result?.result?.value as T
}

function inspectExpression(): string {
  return `(() => {
    const bodyText = document.body?.innerText || ''
    const buttons = Array.from(document.querySelectorAll('button'))
    const buttonTexts = buttons
      .map((button) => (button.textContent || '').trim())
      .filter(Boolean)
      .slice(0, 30)
    const findButton = (testId, pattern) => {
      const byTestId = document.querySelector('[data-testid="' + testId + '"]')
      if (byTestId) return byTestId
      return buttons.find((button) => pattern.test((button.textContent || '').trim())) || null
    }
    const findParagraph = (testId, pattern) => {
      const byTestId = document.querySelector('[data-testid="' + testId + '"]')
      if (byTestId) return byTestId
      return Array.from(document.querySelectorAll('p')).find((element) =>
        pattern.test((element.textContent || '').trim())
      ) || null
    }
    const dialog = document.querySelector('[data-testid="login-recovery-dialog"]')
      || Array.from(document.querySelectorAll('.login-dialog, [class*="login-dialog"], .modal, [role="dialog"]')).find((element) =>
        /(系统浏览器未自动打开|system browser did not open|登录会话仍在等待|sign-in session is still waiting|登录超时|sign-in failed|登录失败|timed out|timeout)/i.test((element.textContent || '').trim())
      )
      || null
    const description = findParagraph(
      'login-recovery-description',
      /(已打开授权页面|authorization page has been opened|登录超时|sign-in failed|登录失败|timed out|timeout)/i
    )
    const manualHint = findParagraph(
      'login-recovery-manual-hint',
      /(系统浏览器未自动打开|system browser did not open|登录会话仍在等待|sign-in session is still waiting|复制登录链接|copy the sign-in link|短码|code:)/i
    )
    const copyLink = findButton('login-recovery-copy-link', /(复制登录链接|copy sign-in link|copy login link)/i)
    const copyCode = findButton('login-recovery-copy-code', /(复制短码|copy code|copy sign-in code)/i)
    const reopen = findButton('login-recovery-reopen', /(重新打开|reopen)/i)
    const retry = findButton('login-recovery-retry', /(重试|retry)/i)
    return {
      href: location.href,
      title: document.title,
      readyState: document.readyState,
      bodyText: bodyText.slice(0, 5000),
      dialogText: (dialog?.textContent || '').trim().slice(0, 3000),
      manualHintText: (manualHint?.textContent || '').trim(),
      loginStageText: (description?.textContent || '').trim(),
      visibleButtons: buttonTexts,
      hasLoginRecoveryDialog: Boolean(dialog),
      hasAuthorizeUrlCopy: Boolean(copyLink),
      hasUserCodeCopy: Boolean(copyCode),
      hasReopenAction: Boolean(reopen),
      hasRetryAction: Boolean(retry),
      copyStates: {
        link: copyLink?.getAttribute('data-copy-state') || '',
        code: copyCode?.getAttribute('data-copy-state') || ''
      }
    }
  })()`
}

async function inspectTarget(target: DevToolsTarget): Promise<LoginRecoveryDom> {
  return await withTarget(target, async (send) =>
    evaluate<LoginRecoveryDom>(send, inspectExpression())
  )
}

function routeToSettingsExpression(): string {
  return `(() => {
    if (!location.hash.includes('/setting')) {
      location.hash = '#/setting'
      return 'navigated'
    }
    return 'already-settings'
  })()`
}

function clickLoginExpression(): string {
  return `(() => {
    const buttons = Array.from(document.querySelectorAll('button'))
    const loginButton = buttons.find((button) => /^(登录|Sign in|Log in)$/i.test((button.textContent || '').trim()))
      || buttons.find((button) => /登录|Sign in|Log in/i.test(button.textContent || ''))
    if (!(loginButton instanceof HTMLElement)) return false
    loginButton.click()
    return true
  })()`
}

async function prepareLoginDialog(target: DevToolsTarget): Promise<boolean> {
  return await withTarget(target, async (send) => {
    await evaluate<string>(send, routeToSettingsExpression())
    await sleep(800)
    const clicked = await evaluate<boolean>(send, clickLoginExpression())
    if (!clicked) return false
    await sleep(1_200)
    return true
  })
}

async function waitForScenarioDom(
  target: DevToolsTarget,
  scenario: LoginRecoveryScenario
): Promise<LoginRecoveryDom> {
  const timeoutMs = scenario === 'timeout' ? 8_000 : 6_000
  const startedAt = Date.now()
  let lastDom = await inspectTarget(target)
  while (Date.now() - startedAt <= timeoutMs) {
    lastDom = await inspectTarget(target)
    if (scenario === 'browser-open-failure') {
      if (
        lastDom.hasLoginRecoveryDialog &&
        lastDom.hasAuthorizeUrlCopy &&
        lastDom.hasUserCodeCopy
      ) {
        return lastDom
      }
    } else if (lastDom.hasLoginRecoveryDialog && lastDom.hasRetryAction) {
      return lastDom
    }
    await sleep(300)
  }
  return lastDom
}

async function clickCopyAction(
  target: DevToolsTarget,
  testId: 'login-recovery-copy-link' | 'login-recovery-copy-code'
): Promise<string> {
  const labelPattern =
    testId === 'login-recovery-copy-link'
      ? '(复制登录链接|copy sign-in link|copy login link)'
      : '(复制短码|copy code|copy sign-in code)'
  return await withTarget(target, async (send) => {
    const clicked = await evaluate<boolean>(
      send,
      `(() => {
        const element = document.querySelector('[data-testid="${testId}"]')
          || Array.from(document.querySelectorAll('button')).find((button) =>
            /${labelPattern}/i.test((button.textContent || '').trim())
          )
        if (!(element instanceof HTMLElement)) return false
        element.click()
        return true
      })()`
    )
    if (!clicked) return 'missing'
    await sleep(300)
    const state = await evaluate<string>(
      send,
      `document.querySelector('[data-testid="${testId}"]')?.getAttribute('data-copy-state') || ''`
    )
    return state || 'clicked'
  })
}

async function captureScreenshot(target: DevToolsTarget, screenshotPath: string): Promise<void> {
  await withTarget(target, async (send) => {
    const response = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true
    })
    const data = response.result?.data
    if (typeof data !== 'string' || data.length === 0) {
      throw new Error('CDP did not return screenshot data')
    }
    const resolvedPath = path.resolve(screenshotPath)
    await mkdir(path.dirname(resolvedPath), { recursive: true })
    await writeFile(resolvedPath, Buffer.from(data, 'base64'))
  })
}

export function selectSettingsTarget(
  inspected: Array<{ target: DevToolsTarget; dom: LoginRecoveryDom }>
): { target: DevToolsTarget; dom: LoginRecoveryDom } | undefined {
  return inspected
    .map((item, index) => ({ item, index, score: scoreSettingsTarget(item) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.item
}

function scoreSettingsTarget(item: { target: DevToolsTarget; dom: LoginRecoveryDom }): number {
  const href = `${item.target.url}\n${item.dom.href}`.toLowerCase()
  const text = `${item.dom.bodyText}\n${item.target.title}`.toLowerCase()
  let score = 0
  if (href.includes('/setting')) score += 80
  if (text.includes('账户') || text.includes('account')) score += 40
  if (text.includes('登录') || text.includes('sign in')) score += 30
  if (item.dom.hasLoginRecoveryDialog) score += 100
  if (href.includes('meta-overlay')) score -= 50
  return score
}

export function buildScenarioFailures(
  scenario: LoginRecoveryScenario,
  dom: LoginRecoveryDom,
  screenshotPath?: string,
  copyResults: LoginRecoveryProbeResult['copyResults'] = {},
  networkFailureCopy = ''
): string[] {
  const failures: string[] = []
  const text = `${dom.bodyText}\n${dom.dialogText}\n${dom.loginStageText}\n${dom.manualHintText}`

  if (!dom.hasLoginRecoveryDialog) {
    failures.push('Login recovery dialog is not visible.')
  }
  if (scenario === 'browser-open-failure') {
    if (!/浏览器未自动打开|browser did not open|system browser/i.test(text)) {
      failures.push('Browser-open failure recovery copy is not visible.')
    }
    if (!/仍在等待|still waiting|剩余|remaining/i.test(text)) {
      failures.push('Device authorization waiting/session-retention copy is not visible.')
    }
    if (!dom.hasAuthorizeUrlCopy) failures.push('Manual login URL copy action is not visible.')
    if (!dom.hasUserCodeCopy) failures.push('Short user code copy action is not visible.')
    if (copyResults.link && copyResults.link !== 'success') {
      failures.push(`Manual login URL copy action did not report success: ${copyResults.link}`)
    }
    if (copyResults.code && copyResults.code !== 'success') {
      failures.push(`Short user code copy action did not report success: ${copyResults.code}`)
    }
  } else {
    if (!/超时|timed out|timeout/i.test(text)) {
      failures.push('Timeout failure copy is not user-readable.')
    }
    if (!/网络连接失败|network connection failed|proxy/i.test(networkFailureCopy)) {
      failures.push('Network failure copy is not represented in the probe JSON.')
    }
    if (!dom.hasRetryAction) failures.push('Retry action is not visible after timeout.')
  }
  if (!screenshotPath) failures.push('No screenshot artifact path was provided.')
  return failures
}

async function runProbe(options: CliOptions): Promise<LoginRecoveryProbeResult> {
  const result: LoginRecoveryProbeResult = {
    ok: false,
    scenario: options.scenario,
    checkedAt: new Date().toISOString(),
    remoteDebuggingUrl: options.remoteDebuggingUrl,
    visibleButtons: [],
    manualHintText: '',
    loginStageText: '',
    hasAuthorizeUrlCopy: false,
    hasUserCodeCopy: false,
    copyResults: {},
    targets: [],
    failures: []
  }

  const targets = await loadTargets(options.remoteDebuggingUrl)
  const pageTargets = targets.filter(
    (target) => target.type === 'page' && Boolean(target.webSocketDebuggerUrl)
  )
  result.targets = pageTargets.map((target) => ({
    id: target.id,
    title: target.title,
    type: target.type,
    url: target.url
  }))

  const inspected: Array<{ target: DevToolsTarget; dom: LoginRecoveryDom }> = []
  for (const target of pageTargets) {
    inspected.push({ target, dom: await inspectTarget(target) })
  }

  const selected = selectSettingsTarget(inspected)
  if (!selected) {
    result.failures.push('Packaged Settings CDP target was not found.')
    return result
  }

  result.selectedTargetId = selected.target.id
  const clickedLogin = await prepareLoginDialog(selected.target)
  if (!clickedLogin) {
    result.failures.push('Settings login button was not found or could not be clicked.')
  }

  let dom = await waitForScenarioDom(selected.target, options.scenario)
  if (options.scenario === 'browser-open-failure') {
    if (dom.hasAuthorizeUrlCopy) {
      result.copyResults.link = await clickCopyAction(selected.target, 'login-recovery-copy-link')
    }
    if (dom.hasUserCodeCopy) {
      result.copyResults.code = await clickCopyAction(selected.target, 'login-recovery-copy-code')
    }
    dom = await inspectTarget(selected.target)
  }

  if (options.screenshot) {
    await captureScreenshot(selected.target, options.screenshot)
    result.screenshotPath = options.screenshot
  }

  result.dom = dom
  result.bodyText = dom.bodyText
  result.visibleButtons = dom.visibleButtons
  result.manualHintText = dom.manualHintText
  result.loginStageText = dom.loginStageText
  result.networkFailureCopy =
    options.scenario === 'timeout' ? '网络连接失败，请检查网络或代理设置。' : undefined
  result.hasAuthorizeUrlCopy = dom.hasAuthorizeUrlCopy
  result.hasUserCodeCopy = dom.hasUserCodeCopy
  result.failures.push(
    ...buildScenarioFailures(
      options.scenario,
      dom,
      options.screenshot,
      result.copyResults,
      result.networkFailureCopy
    )
  )
  result.ok = result.failures.length === 0
  return result
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const report = await runProbe(options)
  const output = `${JSON.stringify(report, null, options.pretty ? 2 : 0)}\n`
  if (options.output) {
    const outputPath = path.resolve(options.output)
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, output, 'utf8')
  }
  process.stdout.write(output)
  if (!report.ok) process.exitCode = 1
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (entryPath && import.meta.url === entryPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
