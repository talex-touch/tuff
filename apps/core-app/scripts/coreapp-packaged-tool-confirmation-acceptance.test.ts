// @vitest-environment jsdom

import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parsePiCliLine,
  readPiSessionProtocolVersion
} from '../src/main/modules/ai/providers/pi-cli-runtime'
import type { CdpSend } from './coreapp-packaged-ai-ask-probe'
import {
  TOOL_FIXTURE_SCHEMA,
  TOOL_ID,
  TOOL_RISK,
  CONTROLLED_TURN_PROMPT,
  PROFILE_MARKER_FILE,
  PROFILE_MARKER_SCHEMA,
  assessAgentToolAuditSequence,
  assessAssistantMessage,
  assessCancelledAssistantMessages,
  assessScenario,
  bucketTimeoutElapsed,
  buildControlledPiFixtureSource,
  buildToolAcceptanceLaunchEnv,
  cancelAuditMaxElapsedMs,
  captureAgentToolAuditLogCursor,
  cleanupPreparedToolAcceptanceProfile,
  decodeAgentToolAuditLogLine,
  dismissOwnedStartupModal,
  isAgentToolGatewayState,
  isControlledFixtureStatus,
  isCancelAuditTimely,
  isExpectedConfirmationCard,
  projectAcceptanceFailure,
  readAgentToolGatewayState,
  readAgentToolAuditsSince,
  readAppBundleVersion,
  submitControlledTurn,
  waitForReviewModeGatewayReady,
  withTemporaryCardRedaction,
  type CardSnapshot,
  type AgentToolAuditDecision,
  type AgentToolAuditEvent,
  type AgentToolAuditEvidence,
  type AgentToolAuditResultCode,
  type AssistantMessageSnapshot,
  type ControlledFixtureStatus,
  type ScenarioAssessmentInput,
  type ScenarioName,
  type ToolAcceptanceLaunchPaths
} from './coreapp-packaged-tool-confirmation-acceptance'

const temporaryRoots = new Set<string>()

afterEach(async () => {
  await Promise.all(
    [...temporaryRoots].map(async (root) => {
      await rm(root, { recursive: true, force: true })
      temporaryRoots.delete(root)
    })
  )
  document.body.replaceChildren()
  Reflect.deleteProperty(document, 'elementFromPoint')
  vi.restoreAllMocks()
})

describe('packaged app provenance', () => {
  it('reads the version from the tested bundle Info.plist', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tuff-tool-provenance-test-'))
    temporaryRoots.add(root)
    await mkdir(path.join(root, 'Contents'), { recursive: true })
    await writeFile(
      path.join(root, 'Contents', 'Info.plist'),
      `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>9.8.7</string></dict></plist>`,
      'utf8'
    )

    await expect(readAppBundleVersion(root)).resolves.toBe('9.8.7')
  })
})

async function createFixture(): Promise<{
  root: string
  fixturePath: string
  statusDir: string
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'tuff-tool-fixture-test-'))
  temporaryRoots.add(root)
  const fixturePath = path.join(root, 'fixture.mjs')
  const statusDir = path.join(root, 'status')
  await mkdir(statusDir, { recursive: true })
  await writeFile(fixturePath, buildControlledPiFixtureSource(), { mode: 0o700 })
  return { root, fixturePath, statusDir }
}

function spawnFixture(
  fixturePath: string,
  statusDir: string,
  gatewayUrl: string,
  gatewayToken: string,
  prompt = CONTROLLED_TURN_PROMPT
): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, [fixturePath, prompt], {
    env: {
      PATH: process.env.PATH,
      HOME: path.dirname(statusDir),
      TUFF_TOOL_ACCEPTANCE_STATUS_DIR: statusDir,
      TUFF_TOOL_GATEWAY_URL: gatewayUrl,
      TUFF_TOOL_GATEWAY_TOKEN: gatewayToken
    },
    stdio: ['pipe', 'pipe', 'pipe']
  })
}

function collectStdout(child: ChildProcessWithoutNullStreams): Promise<string> {
  child.stdout.setEncoding('utf8')
  let output = ''
  child.stdout.on('data', (chunk: string) => {
    output += chunk
  })
  return new Promise((resolve) => child.stdout.once('end', () => resolve(output)))
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

async function listenLoopback(
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
): Promise<{
  url: string
  close: () => Promise<void>
}> {
  const server = createServer((request, response) => {
    void Promise.resolve(handler(request, response)).catch(() => {
      if (!response.destroyed && !response.writableEnded) response.destroy()
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
  const address = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${address.port}/invoke`,
    close: async () => {
      server.closeIdleConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }
}

async function waitForFixtureStatus(
  statusDir: string,
  accept: (status: ControlledFixtureStatus) => boolean,
  timeoutMs = 5_000
): Promise<{ raw: string; status: ControlledFixtureStatus }> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const files = await readdir(statusDir)
    for (const file of files) {
      if (!/^invocation-\d+\.json$/.test(file)) continue
      try {
        const raw = await readFile(path.join(statusDir, file), 'utf8')
        const value: unknown = JSON.parse(raw)
        if (isControlledFixtureStatus(value) && accept(value)) return { raw, status: value }
      } catch {
        // The fixture may be replacing the status document during this poll.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('Fixture status timeout')
}

async function waitForExit(child: ChildProcessWithoutNullStreams): Promise<{
  code: number | null
  signal: NodeJS.Signals | null
}> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { code: child.exitCode, signal: child.signalCode }
  }
  const timeout = setTimeout(() => child.kill('SIGKILL'), 5_000)
  const [code, signal] = (await once(child, 'exit')) as [number | null, NodeJS.Signals | null]
  clearTimeout(timeout)
  return { code, signal }
}

function passingScenario(
  input: Pick<
    ScenarioAssessmentInput,
    | 'name'
    | 'decision'
    | 'resultCode'
    | 'rememberReplaySkipped'
    | 'replayConfirmationCount'
    | 'timeoutElapsedBucket'
  >
): ScenarioAssessmentInput {
  const expectations: Record<
    ScenarioName,
    { decision: AgentToolAuditDecision; code: AgentToolAuditResultCode }
  > = {
    deny: { decision: 'denied', code: 'TOOL_APPROVAL_DENIED' },
    allow: { decision: 'approved', code: 'TOOL_OK' },
    'remember-replay': { decision: 'approved', code: 'TOOL_OK' },
    reset: { decision: 'approved', code: 'TOOL_OK' },
    timeout: { decision: 'denied', code: 'TOOL_APPROVAL_DENIED' },
    cancel: { decision: 'failed', code: 'TOOL_EXECUTION_ABORTED' }
  }
  const auditEvidence = (
    decision: AgentToolAuditDecision,
    code: AgentToolAuditResultCode
  ): AgentToolAuditEvidence => ({
    ok: true,
    eventCount: 3,
    decision,
    status: code === 'TOOL_OK' ? 'success' : 'error',
    code
  })
  const expectation = expectations[input.name]
  return {
    confirmationCount: 1,
    cardVisible: true,
    cardCleared: true,
    requestEnded: true,
    documentHidden: false,
    audit: auditEvidence(expectation.decision, expectation.code),
    ...(input.name === 'remember-replay'
      ? { replayAudit: auditEvidence('remembered', 'TOOL_OK') }
      : {}),
    ...(input.name === 'cancel' ? { cancelAuditElapsedMs: 100, confirmationTimeoutMs: 1_000 } : {}),
    ...input
  }
}

const AUDIT_CALL_ID = '123e4567-e89b-42d3-a456-426614174000'
const SECOND_AUDIT_CALL_ID = '123e4567-e89b-42d3-a456-426614174001'

function makeAuditTrace(
  decision: AgentToolAuditDecision,
  code: AgentToolAuditResultCode,
  callId = AUDIT_CALL_ID
): AgentToolAuditEvent[] {
  return [
    {
      schema: 'agent-tool-audit/v1',
      phase: 'call',
      callId,
      toolId: TOOL_ID,
      risk: TOOL_RISK
    },
    {
      schema: 'agent-tool-audit/v1',
      phase: 'decision',
      callId,
      toolId: TOOL_ID,
      risk: TOOL_RISK,
      decision
    },
    {
      schema: 'agent-tool-audit/v1',
      phase: 'result',
      callId,
      toolId: TOOL_ID,
      risk: TOOL_RISK,
      status: code === 'TOOL_OK' ? 'success' : 'error',
      durationMs: 25,
      code
    }
  ]
}

function auditLogLine(value: unknown): string {
  return `[2026-08-25T12:00:00.000] [INFO] default - [12:00:00.001] [INFO] [agent-tools] Agent tool audit ${JSON.stringify(value)}`
}

function cdpValue(value: unknown): Awaited<ReturnType<CdpSend>> {
  return { result: { result: { value } } }
}

function domBackedCdpSend() {
  return vi.fn<CdpSend>(async (method, params) => {
    if (method === 'Page.bringToFront') return {}
    if (method === 'Input.dispatchMouseEvent') {
      if (params?.type === 'mouseReleased') {
        const x = typeof params.x === 'number' ? params.x : 0
        const y = typeof params.y === 'number' ? params.y : 0
        document
          .elementFromPoint(x, y)
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      }
      return {}
    }
    const expression = String(params?.expression)
    if (expression.includes('window.focus(); return true')) return cdpValue(true)
    if (expression === 'document.hidden === false') return cdpValue(true)
    return cdpValue(await new Function(`return (${expression})`)())
  })
}

function controlledSubmitSend(
  readSubmitReady: () => boolean,
  options: {
    reviewModeActive?: boolean | (() => boolean)
    gatewayReady?: boolean | (() => boolean)
  } = {}
) {
  return vi.fn(async (method, params) => {
    if (method === 'Page.bringToFront') return {}
    const expression = typeof params?.expression === 'string' ? params.expression : ''
    if (expression.includes('window.focus(); return true')) return cdpValue(true)
    if (expression === 'document.hidden === false') return cdpValue(true)
    if (expression.includes('agent-tools:api:get-state')) {
      const ready =
        typeof options.gatewayReady === 'function'
          ? options.gatewayReady()
          : (options.gatewayReady ?? true)
      return cdpValue({
        enabled: true,
        mode: 'review',
        ready,
        tools: ready ? [TOOL_ID] : []
      })
    }
    if (expression.includes("HomePermissionMenu-Pill')?.classList.contains('active')")) {
      return cdpValue(
        typeof options.reviewModeActive === 'function'
          ? options.reviewModeActive()
          : (options.reviewModeActive ?? true)
      )
    }
    if (expression.includes("input.dispatchEvent(new InputEvent('input'")) return cdpValue(true)
    if (expression.includes('return !(') && expression.includes('button.disabled')) {
      return cdpValue(readSubmitReady())
    }
    if (expression.includes('button.click()')) {
      const active =
        typeof options.reviewModeActive === 'function'
          ? options.reviewModeActive()
          : (options.reviewModeActive ?? true)
      return cdpValue(active ? 'submitted' : 'review-mode-inactive')
    }
    throw new Error(`Unexpected CDP expression: ${expression}`)
  })
}

describe('packaged tool confirmation acceptance contracts', () => {
  it('accepts a confirmation card only when its surface and controls are unobscured', () => {
    const card: CardSnapshot = {
      confirmationCount: 1,
      visible: true,
      unobscured: true,
      toolId: TOOL_ID,
      risk: TOOL_RISK,
      summary: 'Read ~/Documents/tuff-tool-canary.txt',
      input: '{"path":"~/Documents/tuff-tool-canary.txt"}',
      documentHidden: false
    }

    expect(isExpectedConfirmationCard(card)).toBe(true)
    expect(isExpectedConfirmationCard({ ...card, unobscured: false })).toBe(false)
    expect(isExpectedConfirmationCard({ ...card, visible: false })).toBe(false)
  })

  it('dismisses only the owned release-notes modal through a visible CDP click', async () => {
    document.body.innerHTML = `
      <div class="tx-modal__overlay" role="dialog" aria-modal="true">
        <div class="tx-modal__content">
          <section class="tx-modal__body">
            <div class="whats-changed-dialog">Release notes</div>
          </section>
          <footer class="tx-modal__footer">
            <div class="whats-changed-dialog__actions">
              <button class="tx-button variant-primary" type="button">Close</button>
            </div>
          </footer>
        </div>
      </div>
    `
    const overlay = document.querySelector<HTMLElement>('.tx-modal__overlay')!
    const button = document.querySelector<HTMLButtonElement>(
      '.whats-changed-dialog__actions button'
    )!
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      x: 600,
      y: 434,
      left: 600,
      top: 434,
      right: 680,
      bottom: 466,
      width: 80,
      height: 32,
      toJSON: () => ({})
    } as DOMRect)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn().mockReturnValueOnce(overlay).mockReturnValue(button)
    })
    button.addEventListener('click', () => overlay.remove())
    const send = domBackedCdpSend()

    await expect(dismissOwnedStartupModal(send)).resolves.toBeUndefined()
    expect(send.mock.calls.filter(([method]) => method === 'Input.dispatchMouseEvent')).toEqual([
      [
        'Input.dispatchMouseEvent',
        { type: 'mousePressed', x: 640, y: 450, button: 'left', clickCount: 1 }
      ],
      [
        'Input.dispatchMouseEvent',
        { type: 'mouseReleased', x: 640, y: 450, button: 'left', clickCount: 1 }
      ]
    ])
  })

  it('refuses to tunnel through an unrelated startup modal', async () => {
    document.body.innerHTML = `
      <div class="tx-modal__overlay" role="dialog" aria-modal="true">
        <div class="tx-modal__content">
          <section class="tx-modal__body"><div class="other-dialog">Other</div></section>
        </div>
      </div>
    `
    const send = domBackedCdpSend()

    await expect(dismissOwnedStartupModal(send)).rejects.toThrow('UNEXPECTED_STARTUP_MODAL')
    expect(send.mock.calls.some(([method]) => method === 'Input.dispatchMouseEvent')).toBe(false)
  })

  it('accepts only the exact authoritative gateway state shape', () => {
    expect(
      isAgentToolGatewayState({
        enabled: true,
        mode: 'review',
        ready: true,
        tools: [TOOL_ID]
      })
    ).toBe(true)
    expect(
      isAgentToolGatewayState({
        enabled: true,
        mode: 'review',
        ready: true,
        tools: [TOOL_ID],
        token: 'must-not-cross-the-boundary'
      })
    ).toBe(false)
    expect(
      isAgentToolGatewayState({ enabled: true, mode: 'off', ready: true, tools: [TOOL_ID] })
    ).toBe(false)
  })

  it('projects an invalid raw channel reply to null inside the renderer expression', async () => {
    const canary = 'raw-error@/Users/private/tool-secret'
    let pageResult: unknown
    const send = vi.fn<CdpSend>(async (method, params) => {
      expect(method).toBe('Runtime.evaluate')
      const expression = String(params?.expression)
      pageResult = await new Function('window', `return ${expression}`)({
        touchChannel: {
          send: async () => ({ message: canary })
        }
      })
      return cdpValue(pageResult)
    })

    await expect(readAgentToolGatewayState(send)).resolves.toBeNull()
    expect(pageResult).toBeNull()
    expect(JSON.stringify(pageResult)).not.toContain(canary)
  })

  it('bounds a renderer state query even when the channel never settles', async () => {
    vi.useFakeTimers()
    try {
      const send = vi.fn<CdpSend>(async (method, params) => {
        expect(method).toBe('Runtime.evaluate')
        const expression = String(params?.expression)
        const pageResult = await new Function('window', `return ${expression}`)({
          touchChannel: {
            send: () => new Promise(() => undefined)
          }
        })
        return cdpValue(pageResult)
      })

      const pending = readAgentToolGatewayState(send)
      await vi.advanceTimersByTimeAsync(1_000)

      await expect(pending).resolves.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits for main to report the review gateway and controlled tool ready', async () => {
    vi.useFakeTimers()
    try {
      let attempts = 0
      const send = vi.fn<CdpSend>(async (method, params) => {
        expect(method).toBe('Runtime.evaluate')
        expect(params?.expression).toContain('agent-tools:api:get-state')
        attempts += 1
        return cdpValue(
          attempts === 1
            ? { enabled: true, mode: 'review', ready: false, tools: [] }
            : { enabled: true, mode: 'review', ready: true, tools: [TOOL_ID] }
        )
      })

      const pending = waitForReviewModeGatewayReady(send)
      await vi.advanceTimersByTimeAsync(150)

      await expect(pending).resolves.toMatchObject({ ready: true, tools: [TOOL_ID] })
      expect(attempts).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits for Vue to enable the controlled turn submit button before clicking', async () => {
    vi.useFakeTimers()
    try {
      let attempts = 0
      const send = controlledSubmitSend(() => {
        attempts += 1
        return attempts >= 3
      })

      const pending = submitControlledTurn(send)
      await vi.advanceTimersByTimeAsync(400)

      await expect(pending).resolves.toBeUndefined()
      expect(attempts).toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails with a stable code when the controlled turn submit button stays disabled', async () => {
    vi.useFakeTimers()
    try {
      const pending = expect(
        submitControlledTurn(controlledSubmitSend(() => false))
      ).rejects.toThrow('CONTROLLED_TURN_NOT_SUBMITTED')

      await vi.advanceTimersByTimeAsync(8_100)
      await pending
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails before editing the turn when review mode has rolled back', async () => {
    const send = controlledSubmitSend(() => true, { reviewModeActive: false })

    await expect(submitControlledTurn(send)).rejects.toThrow('REVIEW_MODE_ROLLED_BACK')
    expect(
      send.mock.calls.some(([, params]) =>
        String(params?.expression).includes("input.dispatchEvent(new InputEvent('input'")
      )
    ).toBe(false)
  })

  it('does not click when main becomes unready while the turn waits', async () => {
    let stateReads = 0
    const send = controlledSubmitSend(() => true, {
      gatewayReady: () => {
        stateReads += 1
        return stateReads === 1
      }
    })

    await expect(submitControlledTurn(send)).rejects.toThrow('REVIEW_MODE_GATEWAY_NOT_READY')
    expect(
      send.mock.calls.some(([, params]) => String(params?.expression).includes('button.click()'))
    ).toBe(false)
  })

  it('does not click when review mode rolls back after the button becomes ready', async () => {
    let uiReads = 0
    const send = controlledSubmitSend(() => true, {
      reviewModeActive: () => {
        uiReads += 1
        return uiReads === 1
      }
    })

    await expect(submitControlledTurn(send)).rejects.toThrow('REVIEW_MODE_ROLLED_BACK')
  })

  it('isolates launch state and removes inherited runtime or credential pollution', () => {
    const paths: ToolAcceptanceLaunchPaths = {
      userDataDir: '/tmp/tuff-tool-profile',
      homeDir: '/tmp/tuff-tool-profile/home',
      codexHome: '/tmp/tuff-tool-profile/controlled/codex-home',
      tempDir: '/tmp/tuff-tool-profile/controlled/tmp',
      fileProviderRoot: '/tmp/tuff-tool-profile/home/Documents',
      piAgentDir: '/tmp/tuff-tool-profile/controlled/pi-agent',
      fixturePath: '/tmp/tuff-tool-profile/controlled/fixture.mjs',
      fixtureStatusDir: '/tmp/tuff-tool-profile/controlled/status'
    }
    const workspaceBin = '/workspace/node_modules/.bin'
    const env = buildToolAcceptanceLaunchEnv(
      {
        HOME: '/Users/private',
        CODEX_HOME: '/Users/private/.codex',
        TMPDIR: '/Users/private/tmp',
        XDG_CONFIG_HOME: '/Users/private/config',
        PATH: `/usr/bin:${workspaceBin}:/bin`,
        ELECTRON_RUN_AS_NODE: '1',
        ELECTRON_ENABLE_LOGGING: '1',
        NODE_OPTIONS: '--require private-hook',
        TSX_TSCONFIG_PATH: '/Users/private/tsconfig.json',
        npm_config_user_agent: 'private-agent',
        PNPM_HOME: '/Users/private/pnpm',
        DYLD_INSERT_LIBRARIES: '/Users/private/inject.dylib',
        TUFF_STARTUP_BENCHMARK_ONCE: '1',
        TUFF_STARTUP_BENCHMARK_EXIT_DELAY_MS: '600000',
        TUFF_TOOL_GATEWAY_TOKEN: 'inherited-gateway-token',
        PI_CODING_AGENT_DIR: '/Users/private/.pi',
        OPENAI_API_KEY: 'inherited-provider-key',
        HTTP_PROXY: 'http://private-proxy',
        SAFE_SENTINEL: 'retained'
      },
      paths,
      500
    )

    expect(env).toMatchObject({
      HOME: paths.homeDir,
      CODEX_HOME: paths.codexHome,
      TMPDIR: paths.tempDir,
      XDG_CACHE_HOME: path.join(paths.homeDir, '.cache'),
      XDG_CONFIG_HOME: path.join(paths.homeDir, '.config'),
      XDG_DATA_HOME: path.join(paths.homeDir, '.local', 'share'),
      TUFF_STARTUP_BENCHMARK_USER_DATA_DIR: paths.userDataDir,
      TUFF_PACKAGED_ACCEPTANCE_ISOLATED: '1',
      TUFF_FILE_PROVIDER_BASE_WATCH_PATHS: paths.fileProviderRoot,
      TUFF_PI_CLI_PATH: paths.fixturePath,
      PI_CODING_AGENT_DIR: paths.piAgentDir,
      TUFF_TOOL_ACCEPTANCE_STATUS_DIR: paths.fixtureStatusDir,
      TUFF_AGENT_TOOL_CONFIRM_TIMEOUT_MS: '500',
      SAFE_SENTINEL: 'retained'
    })
    expect(env.PATH).toBe('/usr/bin:/bin')
    for (const key of [
      'ELECTRON_RUN_AS_NODE',
      'ELECTRON_ENABLE_LOGGING',
      'NODE_OPTIONS',
      'TSX_TSCONFIG_PATH',
      'npm_config_user_agent',
      'PNPM_HOME',
      'DYLD_INSERT_LIBRARIES',
      'TUFF_STARTUP_BENCHMARK_ONCE',
      'TUFF_STARTUP_BENCHMARK_EXIT_DELAY_MS',
      'OPENAI_API_KEY',
      'HTTP_PROXY'
    ]) {
      expect(env[key]).toBeUndefined()
    }
    expect(env.TUFF_TOOL_GATEWAY_TOKEN).toBeUndefined()

    const productionDefault = buildToolAcceptanceLaunchEnv({}, paths, 120_000)
    expect(productionDefault.TUFF_AGENT_TOOL_CONFIRM_TIMEOUT_MS).toBeUndefined()
  })

  it('projects failures and screenshot paths without retaining raw sensitive values', () => {
    const projection = projectAcceptanceFailure(
      new Error('credential=top-secret at /Users/example/private/profile'),
      'controlled-launch'
    )
    const evidence = assessScenario({
      ...passingScenario({ name: 'allow', decision: 'approved', resultCode: 'TOOL_OK' }),
      screenshot: '/Users/example/private/allow-confirmation.png'
    })

    expect(projection).toEqual({
      stage: 'controlled-launch',
      code: 'ACCEPTANCE_STEP_FAILED'
    })
    expect(evidence.screenshot).toBe('allow-confirmation.png')
    const serialized = JSON.stringify({ projection, evidence })
    expect(serialized).not.toContain('top-secret')
    expect(serialized).not.toContain('/Users/example')
  })

  it('uses explicit timeout boundary buckets', () => {
    expect(bucketTimeoutElapsed(899, 1_000)).toBe('before-timeout')
    expect(bucketTimeoutElapsed(900, 1_000)).toBe('timeout-window')
    expect(bucketTimeoutElapsed(2_500, 1_000)).toBe('timeout-window')
    expect(bucketTimeoutElapsed(2_501, 1_000)).toBe('late')
    expect(bucketTimeoutElapsed(6_000, 1_000)).toBe('late')
  })

  it('decodes only strict redacted gateway audit log projections', () => {
    const trace = makeAuditTrace('approved', 'TOOL_OK')
    for (const event of trace) {
      expect(decodeAgentToolAuditLogLine(auditLogLine(event))).toEqual(event)
    }

    const result = trace[2]!
    const invalidLines = [
      '[agent-tools] INFO Agent tool audit {"schema":"agent-tool-audit/v1"}',
      '[12:00:00.001] [INFO] [agent-tools] Agent tool audit {bad-json}',
      auditLogLine({ ...trace[0], input: { path: '/Users/private/canary' } }),
      auditLogLine({ ...trace[1], secret: 'top-secret' }),
      auditLogLine({ ...trace[0], callId: 'controlled-123' }),
      auditLogLine({ ...result, status: 'success', code: 'TOOL_EXECUTION_FAILED' }),
      auditLogLine({ ...result, durationMs: 86_400_001 }),
      `${auditLogLine(result)} trailing-data`
    ]
    for (const line of invalidLines) expect(decodeAgentToolAuditLogLine(line)).toBeUndefined()
  })

  it('reads only complete audit lines appended after the log cursor', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tuff-tool-audit-test-'))
    temporaryRoots.add(root)
    const logsDir = path.join(root, 'tuff', 'logs')
    const logPath = path.join(logsDir, 'D2026-08-25.log')
    await mkdir(logsDir, { recursive: true })
    await writeFile(logPath, `${auditLogLine(makeAuditTrace('approved', 'TOOL_OK')[0])}\n`)
    const cursor = await captureAgentToolAuditLogCursor(root)
    const trace = makeAuditTrace('denied', 'TOOL_APPROVAL_DENIED')
    await writeFile(
      logPath,
      `${auditLogLine(makeAuditTrace('approved', 'TOOL_OK')[0])}\n${trace
        .map(auditLogLine)
        .join('\n')}\n`
    )
    await writeFile(path.join(logsDir, 'E2026-08-25.err'), `${auditLogLine(trace[0])}\n`)
    await writeFile(path.join(logsDir, 'D2026-08-24.log.gz'), `${auditLogLine(trace[0])}\n`)

    await expect(readAgentToolAuditsSince(root, cursor)).resolves.toEqual(trace)

    await writeFile(
      logPath,
      `${auditLogLine(makeAuditTrace('approved', 'TOOL_OK')[0])}\n[12:00:00.002] [INFO] [agent-tools] Agent tool audit {bad-json}\n`
    )
    await expect(readAgentToolAuditsSince(root, cursor)).rejects.toThrow('AGENT_TOOL_AUDIT_INVALID')
  })

  it('requires one correlated call-decision-result gateway trace', () => {
    const allowTrace = makeAuditTrace('approved', 'TOOL_OK')
    expect(
      assessAgentToolAuditSequence(allowTrace, { decision: 'approved', code: 'TOOL_OK' })
    ).toEqual({
      ok: true,
      eventCount: 3,
      decision: 'approved',
      status: 'success',
      code: 'TOOL_OK'
    })

    const wrongCode = [...allowTrace]
    wrongCode[2] = makeAuditTrace('approved', 'TOOL_EXECUTION_FAILED')[2]!
    expect(
      assessAgentToolAuditSequence(wrongCode, { decision: 'approved', code: 'TOOL_OK' })
    ).toMatchObject({ ok: false, failureCode: 'AGENT_TOOL_AUDIT_RESULT_MISMATCH' })
    expect(
      assessAgentToolAuditSequence(allowTrace.slice(0, 2), {
        decision: 'approved',
        code: 'TOOL_OK'
      })
    ).toMatchObject({ ok: false, failureCode: 'AGENT_TOOL_AUDIT_EVENT_COUNT_MISMATCH' })

    const mixedCallIds = [...allowTrace]
    mixedCallIds[2] = { ...allowTrace[2]!, callId: SECOND_AUDIT_CALL_ID }
    expect(
      assessAgentToolAuditSequence(mixedCallIds, { decision: 'approved', code: 'TOOL_OK' })
    ).toMatchObject({ ok: false, failureCode: 'AGENT_TOOL_AUDIT_CORRELATION_MISMATCH' })

    const timeoutTrace = makeAuditTrace('denied', 'TOOL_APPROVAL_DENIED')
    expect(
      assessAgentToolAuditSequence(timeoutTrace, {
        decision: 'failed',
        code: 'TOOL_EXECUTION_ABORTED'
      })
    ).toMatchObject({ ok: false, failureCode: 'AGENT_TOOL_AUDIT_DECISION_MISMATCH' })
    const serializedEvidence = JSON.stringify(
      assessAgentToolAuditSequence(allowTrace, {
        decision: 'approved',
        code: 'TOOL_OK'
      })
    )
    expect(serializedEvidence).not.toContain(AUDIT_CALL_ID)
    expect(serializedEvidence).not.toContain('durationMs')
  })

  it('requires cancellation audit to arrive well before confirmation timeout', () => {
    expect(cancelAuditMaxElapsedMs(3_000)).toBe(1_500)
    expect(cancelAuditMaxElapsedMs(1_000)).toBe(500)
    expect(isCancelAuditTimely(500, 1_000)).toBe(true)
    expect(isCancelAuditTimely(501, 1_000)).toBe(false)
    expect(isCancelAuditTimely(3_000, 3_000)).toBe(false)
  })

  it('accepts only one complete new assistant message with stable content and actions', () => {
    const complete: AssistantMessageSnapshot = {
      id: 'assistant-new',
      status: 'complete',
      ariaBusy: 'false',
      hasError: false,
      hasActions: true,
      containsExpectedText: true
    }
    expect(assessAssistantMessage(complete)).toEqual({ ok: true })

    const failures: Array<[AssistantMessageSnapshot | undefined, number, string]> = [
      [undefined, 0, 'ASSISTANT_MESSAGE_MISSING'],
      [{ ...complete, status: 'failed' }, 1, 'ASSISTANT_MESSAGE_FAILED'],
      [{ ...complete, hasError: true }, 1, 'ASSISTANT_MESSAGE_FAILED'],
      [{ ...complete, status: 'streaming', ariaBusy: 'true' }, 1, 'ASSISTANT_MESSAGE_STILL_BUSY'],
      [{ ...complete, ariaBusy: null }, 1, 'ASSISTANT_MESSAGE_ARIA_BUSY_INVALID'],
      [{ ...complete, hasActions: false }, 1, 'ASSISTANT_MESSAGE_ACTIONS_MISSING'],
      [{ ...complete, containsExpectedText: false }, 1, 'ASSISTANT_MESSAGE_TEXT_MISMATCH'],
      [complete, 2, 'ASSISTANT_MESSAGE_COUNT_MISMATCH']
    ]
    for (const [snapshot, count, failureCode] of failures) {
      expect(assessAssistantMessage(snapshot, count)).toEqual({ ok: false, failureCode })
    }
  })

  it('accepts cancellation only when the new assistant is removed or non-error complete', () => {
    const partial: AssistantMessageSnapshot = {
      id: 'assistant-cancelled',
      status: 'complete',
      ariaBusy: 'false',
      hasError: false,
      hasActions: true,
      containsExpectedText: false
    }
    expect(assessCancelledAssistantMessages([])).toEqual({ ok: true })
    expect(assessCancelledAssistantMessages([partial])).toEqual({ ok: true })
    expect(
      assessCancelledAssistantMessages([{ ...partial, status: 'failed', hasError: true }])
    ).toEqual({ ok: false, failureCode: 'CANCEL_ASSISTANT_MESSAGE_FAILED' })
    expect(
      assessCancelledAssistantMessages([
        { ...partial, status: 'streaming', ariaBusy: 'true', hasActions: false }
      ])
    ).toEqual({ ok: false, failureCode: 'CANCEL_ASSISTANT_MESSAGE_STILL_BUSY' })
    expect(assessCancelledAssistantMessages([{ ...partial, hasActions: false }])).toEqual({
      ok: false,
      failureCode: 'CANCEL_ASSISTANT_MESSAGE_NOT_SETTLED'
    })
    expect(
      assessCancelledAssistantMessages([partial, { ...partial, id: 'assistant-second' }])
    ).toEqual({ ok: false, failureCode: 'CANCEL_ASSISTANT_MESSAGE_COUNT_MISMATCH' })
  })

  it('restores screenshot redaction after capture or redaction failure', async () => {
    const restoreAfterCapture = vi.fn(async () => undefined)
    await expect(
      withTemporaryCardRedaction(
        async () => 'redacted',
        async () => {
          throw new Error('capture failed')
        },
        restoreAfterCapture
      )
    ).rejects.toThrow('capture failed')
    expect(restoreAfterCapture).toHaveBeenCalledOnce()
    expect(restoreAfterCapture).toHaveBeenCalledWith('redacted')

    const restoreAfterRedaction = vi.fn(async () => undefined)
    await expect(
      withTemporaryCardRedaction<boolean, void>(
        async () => {
          throw new Error('redaction failed')
        },
        async () => undefined,
        restoreAfterRedaction
      )
    ).rejects.toThrow('redaction failed')
    expect(restoreAfterRedaction).toHaveBeenCalledOnce()
    expect(restoreAfterRedaction).toHaveBeenCalledWith(undefined)
  })

  it('deletes only marker-valid runner-created profiles directly under the real temp dir', async () => {
    const marker = JSON.stringify({ schema: PROFILE_MARKER_SCHEMA })
    const callerProfile = await mkdtemp(path.join(tmpdir(), 'tuff-tool-confirmation-caller-'))
    temporaryRoots.add(callerProfile)
    await writeFile(path.join(callerProfile, PROFILE_MARKER_FILE), marker)
    await expect(
      cleanupPreparedToolAcceptanceProfile({ userDataDir: callerProfile, runnerCreated: false })
    ).resolves.toBe(false)
    await expect(access(callerProfile)).resolves.toBeUndefined()

    const wrongPrefix = await mkdtemp(path.join(tmpdir(), 'caller-tool-confirmation-'))
    temporaryRoots.add(wrongPrefix)
    await writeFile(path.join(wrongPrefix, PROFILE_MARKER_FILE), marker)
    await expect(
      cleanupPreparedToolAcceptanceProfile({ userDataDir: wrongPrefix, runnerCreated: true })
    ).rejects.toThrow('PROFILE_CLEANUP_TARGET_REJECTED')
    await expect(access(wrongPrefix)).resolves.toBeUndefined()

    const wrongMarker = await mkdtemp(path.join(tmpdir(), 'tuff-tool-confirmation-'))
    temporaryRoots.add(wrongMarker)
    await writeFile(
      path.join(wrongMarker, PROFILE_MARKER_FILE),
      JSON.stringify({ schema: PROFILE_MARKER_SCHEMA, path: '/Users/private' })
    )
    await expect(
      cleanupPreparedToolAcceptanceProfile({ userDataDir: wrongMarker, runnerCreated: true })
    ).rejects.toThrow('PROFILE_CLEANUP_OWNERSHIP_REJECTED')
    await expect(access(wrongMarker)).resolves.toBeUndefined()

    const runnerProfile = await mkdtemp(path.join(tmpdir(), 'tuff-tool-confirmation-'))
    temporaryRoots.add(runnerProfile)
    await writeFile(path.join(runnerProfile, PROFILE_MARKER_FILE), marker)
    await expect(
      cleanupPreparedToolAcceptanceProfile({ userDataDir: runnerProfile, runnerCreated: true })
    ).resolves.toBe(true)
    await expect(access(runnerProfile)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('requires the scenario-specific terminal contract for all six scenarios', () => {
    const passing: ScenarioAssessmentInput[] = [
      passingScenario({
        name: 'deny',
        decision: 'denied',
        resultCode: 'TOOL_APPROVAL_DENIED'
      }),
      passingScenario({ name: 'allow', decision: 'approved', resultCode: 'TOOL_OK' }),
      passingScenario({
        name: 'remember-replay',
        decision: 'approved-remembered',
        resultCode: 'TOOL_OK',
        rememberReplaySkipped: true,
        replayConfirmationCount: 0
      }),
      passingScenario({
        name: 'reset',
        decision: 'approved-after-reset',
        resultCode: 'TOOL_OK'
      }),
      passingScenario({
        name: 'timeout',
        decision: 'timeout',
        resultCode: 'TOOL_APPROVAL_DENIED',
        timeoutElapsedBucket: 'timeout-window'
      }),
      passingScenario({
        name: 'cancel',
        decision: 'cancelled',
        resultCode: 'TOOL_EXECUTION_ABORTED'
      })
    ]

    for (const input of passing) expect(assessScenario(input).status).toBe('passed')

    const failing: Array<[ScenarioAssessmentInput, string]> = [
      [{ ...passing[0], resultCode: 'TOOL_OK' }, 'DENY_RESULT_MISMATCH'],
      [{ ...passing[1], resultCode: 'TOOL_APPROVAL_DENIED' }, 'ALLOW_RESULT_MISMATCH'],
      [{ ...passing[2], rememberReplaySkipped: false }, 'REMEMBER_REPLAY_MISMATCH'],
      [{ ...passing[3], decision: 'approved' }, 'RESET_RESULT_MISMATCH'],
      [{ ...passing[4], timeoutElapsedBucket: 'before-timeout' }, 'TIMEOUT_RESULT_MISMATCH'],
      [{ ...passing[5], resultCode: 'TOOL_APPROVAL_DENIED' }, 'CANCEL_RESULT_MISMATCH'],
      [{ ...passing[5], cancelAuditElapsedMs: 501 }, 'CANCEL_AUDIT_LATE'],
      [
        { ...passing[5], assistantFailureCode: 'CANCEL_ASSISTANT_MESSAGE_FAILED' },
        'CANCEL_ASSISTANT_MESSAGE_FAILED'
      ],
      [
        {
          ...passing[1],
          audit: {
            ok: false,
            eventCount: 3,
            failureCode: 'AGENT_TOOL_AUDIT_RESULT_MISMATCH'
          }
        },
        'AGENT_TOOL_AUDIT_RESULT_MISMATCH'
      ],
      [
        { ...passing[1], assistantFailureCode: 'ASSISTANT_MESSAGE_FAILED' },
        'ASSISTANT_MESSAGE_FAILED'
      ]
    ]
    for (const [input, failureCode] of failing) {
      expect(assessScenario(input)).toMatchObject({ status: 'failed', failureCode })
    }

    expect(assessScenario({ ...passing[1], cardCleared: false })).toMatchObject({
      status: 'failed',
      failureCode: 'CONFIRMATION_CARD_NOT_CLEARED'
    })
    expect(assessScenario({ ...passing[1], confirmationCount: 2 })).toMatchObject({
      status: 'failed',
      failureCode: 'CONFIRMATION_CARD_COUNT_MISMATCH'
    })
  })

  it('accepts only fixture status documents with stable result codes', () => {
    expect(
      isControlledFixtureStatus({
        schema: TOOL_FIXTURE_SCHEMA,
        phase: 'completed',
        toolId: TOOL_ID,
        risk: TOOL_RISK,
        code: 'TOOL_OK'
      })
    ).toBe(true)
    expect(
      isControlledFixtureStatus({
        schema: TOOL_FIXTURE_SCHEMA,
        phase: 'failed',
        toolId: TOOL_ID,
        risk: TOOL_RISK,
        code: '/Users/example/private token=secret'
      })
    ).toBe(false)
    expect(
      isControlledFixtureStatus({
        schema: TOOL_FIXTURE_SCHEMA,
        phase: 'completed',
        toolId: TOOL_ID,
        risk: TOOL_RISK,
        code: 'TOOL_OK',
        path: '/Users/example/private'
      })
    ).toBe(false)
  })

  it('answers a background title invocation without touching the tool gateway or status files', async () => {
    const fixture = await createFixture()
    let requestCount = 0
    const gateway = await listenLoopback((_request, response) => {
      requestCount += 1
      response.writeHead(500)
      response.end()
    })

    try {
      const child = spawnFixture(
        fixture.fixturePath,
        fixture.statusDir,
        gateway.url,
        'fixture-title-token',
        `Summarize this title without tools: ${CONTROLLED_TURN_PROMPT}`
      )
      child.stderr.resume()
      const [exit, stdout] = await Promise.all([waitForExit(child), collectStdout(child)])

      expect(exit).toEqual({ code: 0, signal: null })
      expect(requestCount).toBe(0)
      await expect(readdir(fixture.statusDir)).resolves.toEqual([])
      const lines = stdout.trim().split('\n')
      expect(readPiSessionProtocolVersion(lines[0] ?? '')).toBe(3)
      const events = lines.flatMap((line) => {
        const event = parsePiCliLine(line)
        return event ? [event] : []
      })
      expect(events.some((event) => event.delta === 'Controlled title')).toBe(true)
      expect(
        events.some((event) =>
          [...(event.partEvents ?? []), ...(event.partEvent ? [event.partEvent] : [])].some(
            (part) => part.kind === 'tool-start' || part.kind === 'tool-result'
          )
        )
      ).toBe(false)
      expect(events.some((event) => event.done === true)).toBe(true)
    } finally {
      await gateway.close()
    }
  })

  it('sends the exact read request for a transcript turn and persists metadata only', async () => {
    const fixture = await createFixture()
    const gatewayToken = 'fixture-gateway-token-canary'
    const privateOutput = 'fixture-private-output-canary'
    let resolveRequest!: (value: {
      authorization: string | undefined
      body: unknown
      method: string | undefined
      url: string | undefined
    }) => void
    const requestReceived = new Promise<{
      authorization: string | undefined
      body: unknown
      method: string | undefined
      url: string | undefined
    }>((resolve) => {
      resolveRequest = resolve
    })
    const gateway = await listenLoopback(async (request, response) => {
      const rawBody = await readRequestBody(request)
      resolveRequest({
        authorization: request.headers.authorization,
        body: JSON.parse(rawBody) as unknown,
        method: request.method,
        url: request.url
      })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ output: privateOutput, isError: false }))
    })

    try {
      const child = spawnFixture(
        fixture.fixturePath,
        fixture.statusDir,
        gateway.url,
        gatewayToken,
        `Conversation so far:\n\nUser: Earlier request.\n\nAssistant: Earlier answer.\n\n---\n\nUser: ${CONTROLLED_TURN_PROMPT}`
      )
      child.stderr.resume()
      const [request, exit, terminal, stdout] = await Promise.all([
        requestReceived,
        waitForExit(child),
        waitForFixtureStatus(
          fixture.statusDir,
          (status) => status.phase === 'completed' && status.code === 'TOOL_OK'
        ),
        collectStdout(child)
      ])

      expect(exit).toEqual({ code: 0, signal: null })
      expect(request).toMatchObject({
        authorization: `Bearer ${gatewayToken}`,
        method: 'POST',
        url: '/invoke',
        body: {
          tool: TOOL_ID,
          args: { path: '~/Documents/tuff-tool-canary.txt' }
        }
      })
      expect(request.body).toMatchObject({ callId: expect.stringMatching(/^controlled-\d+$/) })
      expect(terminal.status).toEqual({
        schema: TOOL_FIXTURE_SCHEMA,
        phase: 'completed',
        toolId: TOOL_ID,
        risk: TOOL_RISK,
        code: 'TOOL_OK'
      })
      expect(Object.keys(terminal.status)).toEqual(['schema', 'phase', 'toolId', 'risk', 'code'])
      const lines = stdout.trim().split('\n')
      expect(readPiSessionProtocolVersion(lines[0] ?? '')).toBe(3)
      const events = lines.flatMap((line) => {
        const parsed = parsePiCliLine(line)
        return parsed?.partEvents ?? (parsed?.partEvent ? [parsed.partEvent] : [])
      })
      expect(events).toEqual(
        expect.arrayContaining([
          { kind: 'tool-start', callId: expect.stringMatching(/^controlled-\d+$/), name: TOOL_ID },
          {
            kind: 'tool-input-end',
            callId: expect.stringMatching(/^controlled-\d+$/),
            input: { path: '~/Documents/tuff-tool-canary.txt' }
          },
          {
            kind: 'tool-result',
            callId: expect.stringMatching(/^controlled-\d+$/),
            name: TOOL_ID,
            output: 'TOOL_OK',
            isError: false
          },
          { kind: 'message-commit' }
        ])
      )
      expect(lines.some((line) => parsePiCliLine(line)?.done === true)).toBe(true)
      for (const forbidden of [
        gatewayToken,
        gateway.url,
        fixture.root,
        '~/Documents/tuff-tool-canary.txt',
        privateOutput,
        CONTROLLED_TURN_PROMPT
      ]) {
        expect(terminal.raw).not.toContain(forbidden)
      }
    } finally {
      await gateway.close()
    }
  })

  it('writes an aborted terminal status and disconnects the gateway on SIGTERM', async () => {
    const fixture = await createFixture()
    const gatewayToken = 'fixture-cancel-token'
    let resolveStarted!: () => void
    const requestStarted = new Promise<void>((resolve) => {
      resolveStarted = resolve
    })
    let resolveDisconnected!: () => void
    const disconnected = new Promise<void>((resolve) => {
      resolveDisconnected = resolve
    })
    const gateway = await listenLoopback(async (request, response) => {
      await readRequestBody(request)
      response.once('close', resolveDisconnected)
      resolveStarted()
    })

    try {
      const child = spawnFixture(fixture.fixturePath, fixture.statusDir, gateway.url, gatewayToken)
      child.stdout.resume()
      child.stderr.resume()
      await Promise.all([
        requestStarted,
        waitForFixtureStatus(
          fixture.statusDir,
          (status) => status.phase === 'started' && status.code === 'TOOL_CALL_PENDING'
        )
      ])
      child.kill('SIGTERM')

      const [exit, terminal] = await Promise.all([
        waitForExit(child),
        waitForFixtureStatus(
          fixture.statusDir,
          (status) => status.phase === 'cancelled' && status.code === 'TOOL_EXECUTION_ABORTED'
        ),
        disconnected
      ])

      expect(exit).toEqual({ code: 0, signal: null })
      expect(terminal.status).toEqual({
        schema: TOOL_FIXTURE_SCHEMA,
        phase: 'cancelled',
        toolId: TOOL_ID,
        risk: TOOL_RISK,
        code: 'TOOL_EXECUTION_ABORTED'
      })
      expect(terminal.raw).not.toContain(gatewayToken)
      expect(terminal.raw).not.toContain(gateway.url)
      expect(terminal.raw).not.toContain(fixture.root)
    } finally {
      await gateway.close()
    }
  })
})
