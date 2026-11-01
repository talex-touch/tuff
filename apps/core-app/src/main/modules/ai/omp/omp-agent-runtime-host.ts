import type {
  PiRuntimeRunEvent,
  PiRuntimeRunResult,
  PiRuntimeStartPayload,
  PiRuntimeUsage
} from '../pi-agent-runtime-protocol'
import type { PiWorkspaceAuthority } from '../pi-agent-runtime-host'
import { OmpAcpClient, type OmpAcpSession } from '@talex-touch/tuff-intelligence'
import { createLogger } from '../../../utils/logger'
import { resolveOmpExecutable } from '../providers/pi-cli-runtime'

const ompHostLog = createLogger('Intelligence').child('OmpAgentRuntimeHost')

export interface OmpAgentRuntimeHostOptions {
  onEvent?: (event: PiRuntimeRunEvent) => Promise<void>
  onRecord?: (runId: string, record: unknown) => Promise<void>
}

interface ActiveRun {
  runId: string
  session: OmpAcpSession
  controller: AbortController
}

export class OmpAgentRuntimeHost {
  private client: OmpAcpClient | null = null
  private startPromise: Promise<void> | null = null
  private readonly activeRuns = new Map<string, ActiveRun>()
  private readonly onEvent?: OmpAgentRuntimeHostOptions['onEvent']
  private readonly onRecord?: OmpAgentRuntimeHostOptions['onRecord']

  constructor(options: OmpAgentRuntimeHostOptions = {}) {
    this.onEvent = options.onEvent
    this.onRecord = options.onRecord
  }

  isReady(): boolean {
    return this.client !== null
  }

  isRunActive(runId: string): boolean {
    return this.activeRuns.has(runId)
  }

  async start(): Promise<void> {
    if (this.client) return
    if (this.startPromise) return this.startPromise

    this.startPromise = (async () => {
      const ompExe = await resolveOmpExecutable()
      if (!ompExe) {
        throw new Error('OMP executable not found on this system')
      }

      ompHostLog.info('Starting OMP ACP client', { meta: { ompExe } })
      this.client = await OmpAcpClient.spawn({ executablePath: ompExe })
      ompHostLog.success('OMP ACP client initialized', {
        meta: { agentInfo: this.client.agentInfo }
      })
    })().finally(() => {
      this.startPromise = null
    })

    return this.startPromise
  }

  async stop(): Promise<void> {
    for (const run of this.activeRuns.values()) {
      run.controller.abort()
      await run.session.cancel().catch(() => undefined)
      await run.session.close().catch(() => undefined)
    }
    this.activeRuns.clear()

    if (this.client) {
      const clientToClose = this.client
      this.client = null
      await clientToClose.close().catch(() => undefined)
    }
  }

  async execute(
    payload: PiRuntimeStartPayload,
    workspace?: PiWorkspaceAuthority
  ): Promise<PiRuntimeRunResult> {
    await this.start()
    if (!this.client) throw new Error('OMP ACP runtime is unavailable')

    const runId = payload.run.id
    if (this.activeRuns.has(runId)) {
      throw new Error(`Run ${runId} is already active`)
    }

    const preferredModel =
      workspace?.model ||
      payload.request.modelPreference?.[0] ||
      payload.profile.modelPreference[0] ||
      'cpa/gemini-3.8-flash'

    const session = await this.client.createSession({
      cwd: payload.run.cwd,
      model: preferredModel
    })

    const controller = new AbortController()
    this.activeRuns.set(runId, { runId, session, controller })

    let output = ''
    let usage: PiRuntimeUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    }

    try {
      const promptText = payload.run.objective || payload.request.objective || ''

      for await (const event of session.promptStream(promptText)) {
        if (controller.signal.aborted) break

        if (event.type === 'thinking' && event.text) {
          await this.onEvent?.({
            runId,
            type: 'reasoning',
            level: 'info',
            payload: { delta: event.text }
          })
        } else if (event.type === 'delta' && event.text) {
          output += event.text
          await this.onEvent?.({
            runId,
            type: 'text',
            level: 'info',
            payload: { delta: event.text }
          })
        } else if (event.type === 'usage' && event.usage) {
          usage = {
            promptTokens: event.usage.inputTokens ?? usage.promptTokens,
            completionTokens: event.usage.outputTokens ?? usage.completionTokens,
            totalTokens: event.usage.totalTokens ?? usage.totalTokens,
            cacheReadTokens: event.usage.cacheReadTokens,
            cost: event.usage.cost?.total
          }
        }
      }

      await this.onRecord?.(runId, {
        output,
        usage,
        timestamp: Date.now()
      })

      return {
        runId,
        output,
        usage
      }
    } finally {
      this.activeRuns.delete(runId)
      await session.close().catch(() => undefined)
    }
  }

  cancel(runId: string): boolean {
    const run = this.activeRuns.get(runId)
    if (!run) return false
    run.controller.abort()
    void run.session.cancel().catch(() => undefined)
    return true
  }
}
