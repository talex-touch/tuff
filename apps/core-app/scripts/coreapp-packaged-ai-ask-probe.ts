#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

interface CliOptions {
  remoteDebuggingUrl: string
  output?: string
  screenshot?: string
  inputQuery: string
  submit: boolean
  pretty: boolean
  expectEvidenceTags: AiStableEvidenceTag[]
}

export interface DevToolsTarget {
  id: string
  title: string
  type: string
  url: string
  webSocketDebuggerUrl?: string
}

export interface CoreBoxProbeDom {
  href: string
  title: string
  readyState: string
  bodyText: string
  bodyClass: string
  hasCoreBoxClass: boolean
  inputIdExists: boolean
  inputValue: string
  hasAiChatbot: boolean
  hasErrorNotice: boolean
  hasPermissionText: boolean
  hasModelUnsupportedText: boolean
  hasProviderUnavailableText: boolean
  hasLoggedOutText: boolean
  hasQuotaText: boolean
  buttons: string[]
}

interface ProbeResult {
  ok: boolean
  checkedAt: string
  remoteDebuggingUrl: string
  selectedTargetId?: string
  inputQuery?: string
  screenshotPath?: string
  submitPreparation?: CoreBoxSubmitPreparation
  dom?: CoreBoxProbeDom
  evidenceChecks?: AiStableEvidenceCheck[]
  targets: Array<Pick<DevToolsTarget, 'id' | 'title' | 'type' | 'url'>>
  failures: string[]
}

export type AiStableEvidenceTag =
  | 'AI-STABLE-01'
  | 'AI-STABLE-02'
  | 'AI-STABLE-03'
  | 'AI-STABLE-04'
  | 'AI-STABLE-05'
  | 'AI-STABLE-06'
  | 'AI-STABLE-07'
  | 'AI-STABLE-08'

export interface AiStableEvidenceCheck {
  tag: AiStableEvidenceTag
  matched: boolean
  requirement: string
  signalMatched: boolean
  blockedByFailureSignal: boolean
  hasVisualArtifact: boolean
  matchedSignals: string[]
  missingSignals: string[]
  matchedBlockedSignals: string[]
  artifactPaths: string[]
  visualArtifactPaths: string[]
}

export interface CoreBoxSubmitPreparation {
  alreadyInSendMode: boolean
  clickedFeatureEntry: boolean
  readyForPrompt: boolean
  clickMethod?: 'cdp-enter' | 'cdp-mouse'
  submitMethod?: 'cdp-enter' | 'cdp-send-button'
  activationText?: string
}

type CdpResponse = {
  result?: {
    data?: string
    result?: {
      value?: unknown
    }
  }
}

export type CdpSend = (method: string, params?: Record<string, unknown>) => Promise<CdpResponse>

function printUsage(): void {
  console.log(`Usage:
  corepack pnpm -C "apps/core-app" run visible:experience:ai-ask-probe -- [options]

Options:
  --remoteDebuggingUrl <url>  Packaged Electron /json/list URL. Default: http://127.0.0.1:9342/json/list.
  --input <text>             Optional CoreBox input text to type before probing.
  --submit                   Press Enter after typing input. Use only when the target profile is intentionally prepared.
  --screenshot <path>        Capture the selected CoreBox target screenshot.
  --output <path>            Write probe JSON to a file in addition to stdout.
  --expectEvidenceTag <tag>  Evaluate DOM signals for an AI-STABLE tag. Repeatable.
  --compact                  Print single-line JSON.
  --help                     Show this help.

Notes:
  This script only attaches to an already-running packaged Electron CDP endpoint.
  It does not launch Tuff, seed plugins, mutate permissions, or call provider APIs by itself.
  Evidence tag checks are advisory and do not mark the visible-experience manifest as passed.
`)
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    remoteDebuggingUrl: 'http://127.0.0.1:9342/json/list',
    inputQuery: '',
    submit: false,
    pretty: true,
    expectEvidenceTags: []
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') continue

    if (arg === '--help' || arg === '-h') {
      printUsage()
      return null
    }
    if (arg === '--remoteDebuggingUrl' && argv[i + 1]) {
      options.remoteDebuggingUrl = argv[++i]
      continue
    }
    if (arg === '--input' && argv[i + 1]) {
      options.inputQuery = argv[++i]
      continue
    }
    if (arg === '--submit') {
      options.submit = true
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
    if (arg === '--expectEvidenceTag' && argv[i + 1]) {
      options.expectEvidenceTags.push(parseEvidenceTag(argv[++i]))
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

function parseEvidenceTag(value: string): AiStableEvidenceTag {
  const normalized = value.trim().toUpperCase()
  if (isAiStableEvidenceTag(normalized)) return normalized
  throw new Error(`Unsupported AI Stable evidence tag: ${value}`)
}

function isAiStableEvidenceTag(value: string): value is AiStableEvidenceTag {
  return /^AI-STABLE-0[1-8]$/.test(value)
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

async function inspectTarget(target: DevToolsTarget): Promise<CoreBoxProbeDom> {
  const expression = `(() => {
    const text = document.body?.innerText || ''
    const input = document.querySelector('#core-box-input input, input#core-box-input, input')
    const buttons = Array.from(document.querySelectorAll('button'))
      .map((button) => (button.textContent || '').trim())
      .filter(Boolean)
      .slice(0, 20)
    return {
      href: location.href,
      title: document.title,
      readyState: document.readyState,
      bodyText: text.slice(0, 4000),
      bodyClass: document.body?.className || '',
      hasCoreBoxClass: document.body?.classList?.contains('core-box') === true,
      inputIdExists: Boolean(input),
      inputValue: input && 'value' in input ? input.value : '',
      hasAiChatbot: text.includes('AI') || text.includes('智能问答'),
      hasErrorNotice: text.includes('Error') || text.includes('请求失败') || text.includes('失败'),
      hasPermissionText: text.includes('intelligence.basic') || text.includes('权限'),
      hasModelUnsupportedText: text.includes('NEXUS_STREAM_UNSUPPORTED') || text.includes('不支持该能力'),
      hasProviderUnavailableText: text.includes('provider unavailable') || text.includes('Provider unavailable') || text.includes('Provider 不可用') || text.includes('服务不可用'),
      hasLoggedOutText: text.includes('未登录') || text.includes('需要登录') || text.includes('sign in') || text.includes('logged out'),
      hasQuotaText: text.includes('quota') || text.includes('credits') || text.includes('积分') || text.includes('配额'),
      buttons
    }
  })()`

  return await withTarget(target, async (send) => {
    const response = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    })
    return response.result?.result?.value as CoreBoxProbeDom
  })
}

export async function dispatchCoreBoxSubmitKey(send: CdpSend): Promise<void> {
  const commonParams = {
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13
  }

  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    ...commonParams
  })
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    ...commonParams
  })
}

async function isCoreBoxPromptSendMode(send: CdpSend): Promise<boolean> {
  const response = await send('Runtime.evaluate', {
    expression: `Boolean(document.querySelector('.CoreBox-SendButton'))`,
    returnByValue: true,
    awaitPromise: true
  })
  return response.result?.result?.value === true
}

async function waitForCoreBoxPromptSendMode(
  send: CdpSend,
  timeoutMs = 8_000,
  intervalMs = 100
): Promise<boolean> {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= timeoutMs) {
    if (await isCoreBoxPromptSendMode(send)) return true
    await sleep(intervalMs)
  }
  return false
}

async function getCoreBoxActivationText(send: CdpSend): Promise<string> {
  const response = await send('Runtime.evaluate', {
    expression: `[
      document.querySelector('.CoreBox-SendButton') ? 'send-button' : '',
      document.querySelector('.CoreBoxRes--widget') ? 'widget-mode' : '',
      document.querySelector('.CoreBoxRender-Widget') ? 'widget-render' : '',
      document.body?.innerText?.slice(0, 500) || ''
    ].filter(Boolean).join('\\n')`,
    returnByValue: true,
    awaitPromise: true
  })
  const value = response.result?.result?.value
  return typeof value === 'string' ? value : ''
}

async function clickCoreBoxSendButton(send: CdpSend): Promise<boolean> {
  const response = await send('Runtime.evaluate', {
    expression: `(() => {
      const button = document.querySelector('.CoreBox-SendButton')
      if (!(button instanceof HTMLElement) || button.hasAttribute('disabled')) return false
      const rect = button.getBoundingClientRect()
      if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y) || rect.width <= 0 || rect.height <= 0) {
        return false
      }
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      }
    })()`,
    returnByValue: true,
    awaitPromise: true
  })
  const clickPoint = response.result?.result?.value as { x?: unknown; y?: unknown } | false
  if (!clickPoint || typeof clickPoint.x !== 'number' || typeof clickPoint.y !== 'number') {
    return false
  }
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: clickPoint.x,
    y: clickPoint.y,
    button: 'left',
    clickCount: 1
  })
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: clickPoint.x,
    y: clickPoint.y,
    button: 'left',
    clickCount: 1
  })
  return true
}

export async function prepareCoreBoxPromptSendMode(
  send: CdpSend,
  options: { keyboardTimeoutMs?: number } = {}
): Promise<CoreBoxSubmitPreparation> {
  if (await isCoreBoxPromptSendMode(send)) {
    return {
      alreadyInSendMode: true,
      clickedFeatureEntry: false,
      readyForPrompt: true,
      activationText: await getCoreBoxActivationText(send)
    }
  }

  await dispatchCoreBoxSubmitKey(send)
  const enteredSendModeFromKeyboard = await waitForCoreBoxPromptSendMode(
    send,
    options.keyboardTimeoutMs ?? 1_500
  )
  const keyboardActivationText = await getCoreBoxActivationText(send)
  if (enteredSendModeFromKeyboard || /widget-mode|widget-render|AI 正在思考|请求失败|配额|quota/i.test(keyboardActivationText)) {
    return {
      alreadyInSendMode: false,
      clickedFeatureEntry: true,
      readyForPrompt: enteredSendModeFromKeyboard,
      clickMethod: 'cdp-enter',
      activationText: keyboardActivationText
    }
  }

  const response = await send('Runtime.evaluate', {
    expression: `(() => {
      const selectors = ['.item-list .CoreBoxRender', '.CoreBoxRender']
      const items = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      const uniqueItems = Array.from(new Set(items))
      const feature = uniqueItems.find((item) => /智能问答|touch-intelligence|AI Ask/i.test(item.textContent || '')) || uniqueItems[0]
      if (!feature) return false
      const rect = feature.getBoundingClientRect()
      if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y) || rect.width <= 0 || rect.height <= 0) {
        return false
      }
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || rect.right
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || rect.bottom
      const minX = Math.max(1, rect.left + 1)
      const maxX = Math.max(minX, Math.min(rect.right - 1, viewportWidth - 1))
      const minY = Math.max(1, rect.top + 1)
      const maxY = Math.max(minY, Math.min(rect.bottom - 1, viewportHeight - 1))
      return {
        x: Math.min(Math.max(rect.left + rect.width / 2, minX), maxX),
        y: Math.min(Math.max(rect.top + rect.height / 2, minY), maxY)
      }
    })()`,
    returnByValue: true,
    awaitPromise: true
  })
  const clickPoint = response.result?.result?.value as { x?: unknown; y?: unknown } | false
  if (!clickPoint || typeof clickPoint.x !== 'number' || typeof clickPoint.y !== 'number') {
    return {
      alreadyInSendMode: false,
      clickedFeatureEntry: false,
      readyForPrompt: false
    }
  }
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: clickPoint.x,
    y: clickPoint.y,
    button: 'left',
    clickCount: 1
  })
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: clickPoint.x,
    y: clickPoint.y,
    button: 'left',
    clickCount: 1
  })

  return {
    alreadyInSendMode: false,
    clickedFeatureEntry: true,
    readyForPrompt: await waitForCoreBoxPromptSendMode(send),
    clickMethod: 'cdp-mouse',
    activationText: await getCoreBoxActivationText(send)
  }
}

async function setCoreBoxInput(
  target: DevToolsTarget,
  inputQuery: string,
  submit: boolean
): Promise<CoreBoxSubmitPreparation | undefined> {
  const setInputExpression = `(async () => {
    const input = document.querySelector('#core-box-input input, input#core-box-input, input')
    if (!input) return false
    input.focus()
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (valueSetter) {
      valueSetter.call(input, ${JSON.stringify(inputQuery)})
    } else {
      input.value = ${JSON.stringify(inputQuery)}
    }
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(inputQuery)} }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  })()`

  return await withTarget(target, async (send) => {
    const response = await send('Runtime.evaluate', {
      expression: setInputExpression,
      returnByValue: true,
      awaitPromise: true
    })
    if (response.result?.result?.value !== true) {
      throw new Error('CoreBox input was not available when setting probe input.')
    }
    if (submit) {
      await sleep(250)
    }
    const submitPreparation = submit ? await prepareCoreBoxPromptSendMode(send) : undefined
    if (submit && submitPreparation?.readyForPrompt) {
      const sendModeInputResponse = await send('Runtime.evaluate', {
        expression: setInputExpression,
        returnByValue: true,
        awaitPromise: true
      })
      if (sendModeInputResponse.result?.result?.value !== true) {
        throw new Error('CoreBox input was not available after entering prompt send mode.')
      }
      if (await clickCoreBoxSendButton(send)) {
        submitPreparation.submitMethod = 'cdp-send-button'
      } else {
        await dispatchCoreBoxSubmitKey(send)
        submitPreparation.submitMethod = 'cdp-enter'
      }
    }
    return submitPreparation
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

export function selectCoreBoxTarget(
  inspected: Array<{ target: DevToolsTarget; dom: CoreBoxProbeDom }>
): { target: DevToolsTarget; dom: CoreBoxProbeDom } | undefined {
  const candidates = inspected.filter((item) => item.dom.hasCoreBoxClass && item.dom.inputIdExists)
  return (
    candidates.find((item) => !item.dom.bodyClass.split(/\s+/).includes('division-box')) ??
    candidates[0]
  )
}

function includesAny(text: string, signals: string[]): string[] {
  const lower = text.toLowerCase()
  return signals.filter((signal) => lower.includes(signal.toLowerCase()))
}

function hasAnySignal(text: string, signals: string[]): boolean {
  return includesAny(text, signals).length > 0
}

function removeCurrentInputEcho(bodyText: string, inputValue: string): string {
  const input = inputValue.trim()
  if (!input) return bodyText
  return bodyText.split(input).join('')
}

function getEvidenceBodyText(dom: CoreBoxProbeDom): string {
  return removeCurrentInputEcho(dom.bodyText || '', dom.inputValue || '')
}

function getCommonBlockedSignals(): string[] {
  return [
    'Widget 加载失败',
    '插件 widget 初始化失败',
    'Widget interaction failed',
    'WIDGET_RUNTIME_COMPILE_DISABLED',
    'WIDGET_PRECOMPILED_MISSING',
    'WIDGET_PRECOMPILED_STALE',
    'WIDGET_PRECOMPILED_INTEGRITY_MISMATCH',
    'WIDGET_REGISTER_FAILED',
    'WIDGET_COMPILER_SERVICE_UNAVAILABLE',
    'Widget compiler binary is unavailable'
  ]
}

export function buildEvidenceChecks(
  dom: CoreBoxProbeDom,
  tags: AiStableEvidenceTag[],
  artifactPaths: string[]
): AiStableEvidenceCheck[] {
  const uniqueTags = [...new Set(tags)]
  const bodyText = getEvidenceBodyText(dom)

  return uniqueTags.map((tag) => {
    const {
      requirement,
      signals,
      requireAll,
      requiredSignalGroups,
      blockedSignals = []
    } = getEvidenceSignals(tag)
    const allBlockedSignals = [...blockedSignals, ...getCommonBlockedSignals()]
    const matchedSignals = includesAny(bodyText, signals)
    const matchedBlockedSignals = includesAny(bodyText, allBlockedSignals)
    const blockedByFailureSignal = matchedBlockedSignals.length > 0
    const signalMatched = requiredSignalGroups?.length
      ? requiredSignalGroups.every((group) => hasAnySignal(bodyText, group))
      : requireAll
        ? signals.every((signal) => matchedSignals.includes(signal))
        : matchedSignals.length > 0
    const missingSignals = requiredSignalGroups?.length
      ? requiredSignalGroups.filter((group) => !hasAnySignal(bodyText, group)).flat()
      : signals.filter((signal) => !matchedSignals.includes(signal))
    const visualArtifactPaths = artifactPaths.filter(isVisualArtifactPath)

    return {
      tag,
      requirement,
      matched: signalMatched && !blockedByFailureSignal && visualArtifactPaths.length > 0,
      signalMatched,
      blockedByFailureSignal,
      hasVisualArtifact: visualArtifactPaths.length > 0,
      matchedSignals,
      missingSignals,
      matchedBlockedSignals,
      artifactPaths,
      visualArtifactPaths
    }
  })
}

function isVisualArtifactPath(value: string): boolean {
  return /\.(png|jpe?g|webp|gif|mp4|mov|webm)$/i.test(value.trim())
}

function getEvidenceSignals(tag: AiStableEvidenceTag): {
  requirement: string
  signals: string[]
  requireAll?: boolean
  requiredSignalGroups?: string[][]
  blockedSignals?: string[]
} {
  switch (tag) {
    case 'AI-STABLE-01':
      return {
        requirement: 'CoreBox AI Ask text.chat success preview is visible',
        signals: [
          'text.chat',
          'text chat',
          'trace',
          'trace id',
          'traceId',
          'model',
          '模型',
          'provider',
          '供应商',
          'latency',
          'ms',
          '耗时',
          'input',
          'input kind',
          'inputKind',
          '输入',
          '回答',
          'response',
          'answer'
        ],
        requiredSignalGroups: [
          ['text.chat', 'text chat'],
          ['回答', 'response', 'answer'],
          ['provider', '供应商'],
          ['model', '模型'],
          ['latency', 'ms', '耗时'],
          ['input kind', 'inputKind', 'input', '输入'],
          ['trace', 'trace id', 'traceId']
        ],
        blockedSignals: [
          'Error',
          '请求失败',
          '失败',
          'NEXUS_STREAM_UNSUPPORTED',
          '不支持该能力',
          'unsupported',
          'permission denied',
          '权限',
          'quota exhausted',
          'provider unavailable',
          'empty response',
          'no answer',
          '空回答',
          '无回答',
          '未登录',
          'logged out'
        ]
      }
    case 'AI-STABLE-02':
      return {
        requirement: 'CoreBox AI Ask vision.ocr to text.chat handoff is visible',
        signals: [
          'OCR',
          'vision.ocr',
          '图片',
          'image',
          'text.chat',
          'text chat',
          '回答',
          'response',
          'answer',
          'provider',
          '供应商',
          'model',
          '模型',
          'latency',
          'ms',
          '耗时',
          'input',
          'input kind',
          'inputKind',
          '输入',
          'trace',
          'trace id',
          'traceId'
        ],
        requiredSignalGroups: [
          ['OCR', 'vision.ocr', '图片', 'image'],
          ['text.chat', 'text chat'],
          ['回答', 'response', 'answer'],
          ['provider', '供应商'],
          ['model', '模型'],
          ['latency', 'ms', '耗时'],
          ['input kind', 'inputKind', 'input', '输入'],
          ['trace', 'trace id', 'traceId']
        ],
        blockedSignals: [
          'Error',
          '请求失败',
          '失败',
          'NEXUS_STREAM_UNSUPPORTED',
          '不支持该能力',
          'unsupported',
          'permission denied',
          '权限',
          'quota exhausted',
          'provider unavailable',
          'empty response',
          'no answer',
          '空回答',
          '无回答',
          '未登录',
          'logged out'
        ]
      }
    case 'AI-STABLE-03':
      return {
        requirement: 'Logged-out failure shows a sign-in recovery hint',
        signals: [
          '未登录',
          '需要登录',
          'sign in',
          'logged out',
          'login',
          '登录',
          '恢复',
          '重试',
          'retry',
          'recover'
        ],
        requiredSignalGroups: [
          ['未登录', '需要登录', 'sign in', 'logged out', 'login'],
          ['登录', 'sign in', 'login'],
          ['恢复', '重试', 'retry', 'recover']
        ],
        blockedSignals: [
          'provider called',
          'called provider',
          'invoke provider',
          '调用 provider',
          '调用供应商',
          'text.chat response',
          'answer provider',
          'fallback success',
          'fake success'
        ]
      }
    case 'AI-STABLE-04':
      return {
        requirement: 'Provider unavailable failure shows provider health or settings recovery',
        signals: [
          'provider unavailable',
          'Provider unavailable',
          'Provider 不可用',
          '服务不可用',
          'provider disabled',
          '供应商不可用',
          'provider health',
          'settings',
          '设置',
          '恢复',
          '重试',
          'retry',
          'recover'
        ],
        requiredSignalGroups: [
          [
            'provider unavailable',
            'Provider unavailable',
            'Provider 不可用',
            '服务不可用',
            'provider disabled',
            '供应商不可用'
          ],
          ['provider health', 'settings', '设置', '恢复', '重试', 'retry', 'recover']
        ],
        blockedSignals: [
          'fallback success',
          'fake success',
          'text.chat response',
          'answer provider',
          'provider call succeeded',
          'provider returned answer',
          '调用成功',
          '已返回回答'
        ]
      }
    case 'AI-STABLE-05':
      return {
        requirement: 'Quota exhausted failure shows credits or quota recovery',
        signals: [
          'quota',
          'credits',
          '积分',
          '配额',
          '额度不足',
          'quota exhausted',
          'upgrade',
          'top up',
          '充值',
          '恢复',
          '重试',
          'retry',
          'recover'
        ],
        requiredSignalGroups: [
          ['quota', 'credits', '积分', '配额', '额度不足', 'quota exhausted'],
          ['upgrade', 'top up', '充值', '恢复', '重试', 'retry', 'recover']
        ],
        blockedSignals: [
          'fallback success',
          'fake success',
          'text.chat response',
          'answer provider',
          'provider call succeeded',
          'provider returned answer',
          '扣费成功',
          '已返回回答'
        ]
      }
    case 'AI-STABLE-06':
      return {
        requirement: 'Model unsupported failure shows capability recovery',
        signals: [
          'NEXUS_STREAM_UNSUPPORTED',
          '不支持该能力',
          'unsupported',
          'capability',
          '能力',
          'model',
          '模型',
          'supported model',
          '可用模型',
          '恢复',
          '重试',
          'retry'
        ],
        requiredSignalGroups: [
          ['NEXUS_STREAM_UNSUPPORTED', '不支持该能力', 'unsupported'],
          ['capability', '能力', 'model', '模型'],
          ['supported model', '可用模型', '恢复', '重试', 'retry']
        ],
        blockedSignals: [
          'fallback success',
          'fake success',
          'text.chat response',
          'answer provider',
          'provider call succeeded',
          'provider returned answer',
          '已返回回答'
        ]
      }
    case 'AI-STABLE-07':
      return {
        requirement: 'Permission denied failure does not call Intelligence SDK',
        signals: [
          'intelligence.basic',
          '权限',
          'permission denied',
          'permission',
          '授权',
          '允许',
          'settings',
          '设置',
          '重试',
          'retry'
        ],
        requiredSignalGroups: [
          ['permission denied', '权限', 'permission'],
          ['intelligence.basic'],
          ['授权', '允许', 'settings', '设置', '重试', 'retry']
        ],
        blockedSignals: [
          'Intelligence SDK called',
          'called Intelligence SDK',
          'provider called',
          'called provider',
          'invoke provider',
          '调用 Intelligence',
          '调用 provider',
          'text.chat response',
          'answer provider',
          '已返回回答'
        ]
      }
    case 'AI-STABLE-08':
      return {
        requirement: 'Local/Ollama preferred routing does not call disabled Nexus provider',
        signals: [
          'Local/Ollama',
          'local-default',
          'Ollama',
          'routing',
          'route',
          'provider metadata',
          'Provider',
          'Model',
          'qwen',
          'Latency',
          'ms',
          'Trace',
          'Input kind',
          'inputKind',
          'Capability',
          'text.chat',
          '本地',
          '路由',
          '输入'
        ],
        requiredSignalGroups: [
          ['Local/Ollama', 'local-default', 'Ollama', '本地'],
          ['routing', 'route', 'provider metadata', '路由'],
          ['Provider'],
          ['Model'],
          ['Latency', 'ms'],
          ['Trace'],
          ['Input kind', 'inputKind', '输入'],
          ['Capability', 'text.chat']
        ],
        blockedSignals: [
          'disabled Nexus',
          'Nexus disabled',
          'fallback to Nexus',
          'fallback provider Nexus',
          'called Nexus',
          'Nexus provider called',
          'Nexus call succeeded',
          'Nexus provider returned answer',
          'Nexus returned answer',
          'Nexus response',
          'provider=Nexus',
          'provider: Nexus',
          'selected provider Nexus',
          'route provider Nexus',
          '访问 Nexus',
          '调用 Nexus'
        ]
      }
  }
}

async function runProbe(options: CliOptions): Promise<ProbeResult> {
  const result: ProbeResult = {
    ok: false,
    checkedAt: new Date().toISOString(),
    remoteDebuggingUrl: options.remoteDebuggingUrl,
    inputQuery: options.inputQuery || undefined,
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

  const inspected: Array<{ target: DevToolsTarget; dom: CoreBoxProbeDom }> = []
  for (const target of pageTargets) {
    inspected.push({ target, dom: await inspectTarget(target) })
  }

  const selected = selectCoreBoxTarget(inspected)
  if (!selected) {
    result.failures.push('Packaged CoreBox CDP target with input was not found.')
    return result
  }

  if (options.inputQuery) {
    result.submitPreparation = await setCoreBoxInput(
      selected.target,
      options.inputQuery,
      options.submit
    )
    if (
      options.submit &&
      result.submitPreparation?.clickedFeatureEntry === false &&
      result.submitPreparation?.readyForPrompt === false
    ) {
      result.failures.push('CoreBox AI Ask feature entry did not enter prompt send mode.')
    }
    if (options.submit) await sleep(result.submitPreparation?.readyForPrompt ? 1_500 : 3_500)
    selected.dom = await inspectTarget(selected.target)
  }

  if (options.screenshot) {
    await captureScreenshot(selected.target, options.screenshot)
    result.screenshotPath = options.screenshot
  }

  result.selectedTargetId = selected.target.id
  result.dom = selected.dom
  if (options.expectEvidenceTags.length > 0) {
    const artifactPaths = [options.output, options.screenshot].filter(
      (artifactPath): artifactPath is string => Boolean(artifactPath)
    )
    result.evidenceChecks = buildEvidenceChecks(
      selected.dom,
      options.expectEvidenceTags,
      artifactPaths
    )
    for (const check of result.evidenceChecks) {
      if (!check.signalMatched) {
        result.failures.push(
          `Expected evidence tag was not matched: ${check.tag} -> ${check.requirement}`
        )
      }
      if (check.blockedByFailureSignal) {
        result.failures.push(
          `Expected evidence tag matched failure-state text: ${check.tag} -> ${check.matchedBlockedSignals.join(', ')}`
        )
      }
      if (!check.hasVisualArtifact) {
        result.failures.push(
          `Expected evidence tag has no screenshot or recording artifact: ${check.tag} -> ${check.requirement}`
        )
      }
    }
  }
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
