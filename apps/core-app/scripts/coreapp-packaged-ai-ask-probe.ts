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

interface DevToolsTarget {
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
  hasVisualArtifact: boolean
  matchedSignals: string[]
  missingSignals: string[]
  artifactPaths: string[]
  visualArtifactPaths: string[]
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
  pnpm -C "apps/core-app" run visible:experience:ai-ask-probe -- [options]

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

async function setCoreBoxInput(
  target: DevToolsTarget,
  inputQuery: string,
  submit: boolean
): Promise<void> {
  const expression = `(async () => {
    const input = document.querySelector('#core-box-input input, input#core-box-input, input')
    if (!input) return false
    input.focus()
    input.value = ${JSON.stringify(inputQuery)}
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(inputQuery)} }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    ${submit ? "input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))" : ''}
    return true
  })()`

  await withTarget(target, async (send) => {
    await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    })
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

function selectCoreBoxTarget(
  inspected: Array<{ target: DevToolsTarget; dom: CoreBoxProbeDom }>
): { target: DevToolsTarget; dom: CoreBoxProbeDom } | undefined {
  return inspected.find((item) => item.dom.hasCoreBoxClass && item.dom.inputIdExists)
}

function includesAny(text: string, signals: string[]): string[] {
  const lower = text.toLowerCase()
  return signals.filter((signal) => lower.includes(signal.toLowerCase()))
}

function hasAnySignal(text: string, signals: string[]): boolean {
  return includesAny(text, signals).length > 0
}

export function buildEvidenceChecks(
  dom: CoreBoxProbeDom,
  tags: AiStableEvidenceTag[],
  artifactPaths: string[]
): AiStableEvidenceCheck[] {
  const uniqueTags = [...new Set(tags)]
  const bodyText = dom.bodyText || ''

  return uniqueTags.map((tag) => {
    const { requirement, signals, requireAll, requiredSignalGroups } = getEvidenceSignals(tag)
    const matchedSignals = includesAny(bodyText, signals)
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
      matched: signalMatched && visualArtifactPaths.length > 0,
      signalMatched,
      hasVisualArtifact: visualArtifactPaths.length > 0,
      matchedSignals,
      missingSignals,
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
          ['trace', 'trace id', 'traceId']
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
          ['trace', 'trace id', 'traceId']
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
        ]
      }
    case 'AI-STABLE-08':
      return {
        requirement: 'Local/Ollama preferred routing does not call disabled Nexus provider',
        signals: ['Local', 'Ollama', 'routing', 'route', 'provider metadata', '本地', '路由'],
        requiredSignalGroups: [
          ['Local', 'Ollama', '本地'],
          ['routing', 'route', 'provider metadata', '路由']
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
    await setCoreBoxInput(selected.target, options.inputQuery, options.submit)
    if (options.submit) await sleep(1_500)
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
