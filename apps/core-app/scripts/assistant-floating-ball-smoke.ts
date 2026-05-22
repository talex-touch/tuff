#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

interface CliOptions {
  remoteDebuggingUrl: string
  clickFloatingBall: boolean
  output?: string
  pretty: boolean
}

interface DevToolsTarget {
  id: string
  title: string
  type: string
  url: string
  webSocketDebuggerUrl?: string
}

interface AssistantWindowProbe {
  href: string
  title: string
  text: string
  hasFloatingBall: boolean
  hasVoicePanel: boolean
  hasClipboardImageTranslateButton: boolean
  bodyClass: string
}

interface SmokeResult {
  ok: boolean
  remoteDebuggingUrl: string
  checkedAt: string
  floatingBall?: {
    targetId: string
    text: string
  }
  voicePanel?: {
    targetId: string
    text: string
  }
  failures: string[]
}

type CdpResponse = {
  result?: {
    result?: {
      value?: unknown
    }
  }
}

type CdpSend = (method: string, params?: Record<string, unknown>) => Promise<CdpResponse>

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run smoke:assistant -- [options]

Options:
  --remoteDebuggingUrl <url>  Electron remote debugging /json/list URL. Default: http://127.0.0.1:9337/json/list.
  --noClick                  Only verify the floating ball; do not click it to open VoicePanel.
  --output <path>            Write smoke JSON to a file in addition to stdout.
  --compact                  Print single-line JSON.
  --help                     Show this help.
`)
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    remoteDebuggingUrl: 'http://127.0.0.1:9337/json/list',
    clickFloatingBall: true,
    pretty: true
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
    if (arg === '--noClick') {
      options.clickFloatingBall = false
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

  return options
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
    return await callback(send)
  } finally {
    socket.close()
  }
}

async function inspectTarget(target: DevToolsTarget): Promise<AssistantWindowProbe> {
  const expression = `(() => ({
    href: location.href,
    title: document.title,
    text: document.body?.innerText?.slice(0, 1000) || '',
    hasFloatingBall: !!document.querySelector('.floating-ball-root'),
    hasVoicePanel: !!document.querySelector('.voice-panel-root'),
    hasClipboardImageTranslateButton: Array.from(document.querySelectorAll('button')).some((button) => (button.textContent || '').includes('剪贴板图片翻译') || (button.textContent || '').includes('Translate clipboard image')),
    bodyClass: document.body?.className || ''
  }))()`

  return await withTarget(target, async (send) => {
    const response = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    })
    return response.result?.result?.value as AssistantWindowProbe
  })
}

async function clickFloatingBall(target: DevToolsTarget): Promise<void> {
  await withTarget(target, async (send) => {
    await send('Runtime.evaluate', {
      expression: `document.querySelector('.floating-ball-root')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))`,
      returnByValue: true
    })
  })
}

async function findAssistantWindows(
  remoteDebuggingUrl: string
): Promise<Array<{ target: DevToolsTarget; probe: AssistantWindowProbe }>> {
  const targets = await loadTargets(remoteDebuggingUrl)
  const pageTargets = targets.filter(
    (target) =>
      target.type === 'page' &&
      Boolean(target.webSocketDebuggerUrl) &&
      target.url.startsWith('http')
  )
  const inspected: Array<{ target: DevToolsTarget; probe: AssistantWindowProbe }> = []

  for (const target of pageTargets) {
    const probe = await inspectTarget(target)
    if (probe.hasFloatingBall || probe.hasVoicePanel || probe.hasClipboardImageTranslateButton) {
      inspected.push({ target, probe })
    }
  }

  return inspected
}

async function runSmoke(options: CliOptions): Promise<SmokeResult> {
  const result: SmokeResult = {
    ok: false,
    remoteDebuggingUrl: options.remoteDebuggingUrl,
    checkedAt: new Date().toISOString(),
    failures: []
  }

  let assistantWindows = await findAssistantWindows(options.remoteDebuggingUrl)
  const floatingWindow = assistantWindows.find((item) => item.probe.hasFloatingBall)
  if (!floatingWindow) {
    result.failures.push('Assistant floating ball DOM was not found.')
    result.ok = false
    return result
  }

  result.floatingBall = {
    targetId: floatingWindow.target.id,
    text: floatingWindow.probe.text
  }

  if (options.clickFloatingBall) {
    await clickFloatingBall(floatingWindow.target)
    await sleep(1_200)
    assistantWindows = await findAssistantWindows(options.remoteDebuggingUrl)
  }

  const voicePanel = assistantWindows.find(
    (item) => item.probe.hasVoicePanel && item.probe.hasClipboardImageTranslateButton
  )
  if (!voicePanel) {
    result.failures.push(
      'Assistant VoicePanel with clipboard image translate action was not found.'
    )
  } else {
    result.voicePanel = {
      targetId: voicePanel.target.id,
      text: voicePanel.probe.text
    }
  }

  result.ok = result.failures.length === 0
  return result
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const report = await runSmoke(options)
  const output = `${JSON.stringify(report, null, options.pretty ? 2 : 0)}\n`
  if (options.output) {
    const outputPath = path.resolve(options.output)
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, output, 'utf8')
  }
  process.stdout.write(output)
  if (!report.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
