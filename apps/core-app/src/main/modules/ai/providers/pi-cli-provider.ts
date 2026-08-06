import type {
  IntelligenceChatPayload,
  IntelligenceEmbeddingPayload,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceStreamChunk,
  IntelligenceTranslatePayload,
  IntelligenceUsageInfo
} from '@talex-touch/tuff-intelligence'
import type { ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { spawn } from 'node:child_process'
import { delimiter, dirname } from 'node:path'
import { createInterface } from 'node:readline'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { createLogger } from '../../../utils/logger'
import { IntelligenceProvider } from '../runtime/base-provider'
import { collectMessageAttachments, spillAttachments } from './attachment-spill'
import {
  buildPiArgs,
  buildPiPrompt,
  isFailedStopReason,
  parsePiCliLine,
  PI_CLI_NOT_FOUND,
  resolvePiExecutable
} from './pi-cli-runtime'

const piLog = createLogger('Intelligence').child('PiCli')

/** Enough stderr to identify a failure without letting a chatty run grow unbounded in memory. */
const STDERR_TAIL_LIMIT = 4_000

export interface PiToolRuntimeConfig {
  url: string
  token: string
  tools: string[]
}

/**
 * Reads the live tool grant at spawn time.
 *
 * A getter rather than a value: the user can flip tools on mid-conversation,
 * and the provider is constructed once at registration. Left unset, every run
 * is tool-free — the safe default survives a wiring mistake.
 */
let resolveToolRuntime: (() => PiToolRuntimeConfig | null) | null = null

export function setPiToolRuntimeResolver(
  resolver: (() => PiToolRuntimeConfig | null) | null
): void {
  resolveToolRuntime = resolver
}

interface PiRunState {
  provider?: string
  model?: string
  usage?: IntelligenceUsageInfo
  /** How the most recent assistant message ended — the run's terminal state once stdout closes. */
  stopReason?: string
  /** The failure `pi` last reported, kept so a dead run can say why rather than just going quiet. */
  failure?: string
}

/**
 * Chat backed by the locally installed `pi` CLI.
 *
 * Registered under `LOCAL` rather than as a new provider type: `hasUsableRuntimeCredential` treats
 * every `LOCAL` provider as usable without a key, which is exactly right here — `pi` carries its own
 * credentials — and the privacy layer already classifies a `local` provider with no `baseUrl` as an
 * on-device destination.
 */
export class PiCliProvider extends IntelligenceProvider {
  readonly type = IntelligenceProviderType.LOCAL

  private resolveModel(options: IntelligenceInvokeOptions): string | undefined {
    return options.modelPreference?.[0] || this.config.defaultModel || undefined
  }

  private async spawnPi(
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions,
    attachmentPaths: string[]
  ): Promise<ChildProcessByStdio<null, Readable, Readable>> {
    const executable = await resolvePiExecutable()
    if (!executable) {
      throw new Error(
        `[PiCliProvider] ${PI_CLI_NOT_FOUND}: the 'pi' CLI was not found on this machine`
      )
    }

    const toolRuntime = resolveToolRuntime?.() ?? null
    const args = buildPiArgs(
      buildPiPrompt(payload.messages),
      this.resolveModel(options),
      toolRuntime ? { tools: toolRuntime.tools } : undefined,
      attachmentPaths
    )

    return spawn(executable, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // `pi` is a `#!/usr/bin/env node` script and version managers keep `node` beside it. A GUI
        // launch inherits a PATH that contains neither, so without this the shebang fails to resolve
        // even though the binary itself was found by absolute path.
        PATH: [dirname(executable), process.env.PATH].filter(Boolean).join(delimiter),
        // Defence in depth against duplicated answers. The `pi-retry` extension aborts a stream
        // that goes 90s without a token and hands the turn to pi's auto-retry — a watchdog built
        // for the interactive TUI, where a "retrying" banner explains the pause. Here nobody sees
        // it, so it only produces a second copy of the answer. The commit/rollback handling below
        // survives a retry either way; this stops provoking them.
        PI_RETRY_STALL_TIMEOUT_MS: '0',
        // The extension reads these to reach back into the app. Absent them it
        // registers nothing, so a stale `--tools` list can't grant anything.
        ...(toolRuntime
          ? {
              TUFF_TOOL_GATEWAY_URL: toolRuntime.url,
              TUFF_TOOL_GATEWAY_TOKEN: toolRuntime.token
            }
          : {})
      }
    })
  }

  async *chatStream(
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions
  ): AsyncGenerator<IntelligenceStreamChunk> {
    // Written before the spawn and removed in the `finally` below: the files exist only for the
    // length of this run, which is the whole window in which `pi` can read them.
    const attachments = await spillAttachments(collectMessageAttachments(payload.messages))

    let child: ChildProcessByStdio<null, Readable, Readable>
    try {
      child = await this.spawnPi(payload, options, attachments.paths)
    } catch (error) {
      // A missing CLI throws here, before the run's own cleanup path exists.
      await attachments.cleanup()
      throw error
    }

    const state: PiRunState = {}
    // Deltas are a preview until `pi` settles the message they belong to, so the run tracks two
    // marks: everything streamed and still standing, and the part of it pi committed. A retry
    // rolls the first back to the second; only the second counts as an answer.
    let streamedLength = 0
    let committedLength = 0
    let stderrTail = ''

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_LIMIT)
    })

    const exited = new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code) => resolve(code))
    })

    try {
      const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })

      for await (const line of lines) {
        const event = parsePiCliLine(line)
        if (!event) continue

        if (event.provider) state.provider = event.provider
        if (event.model) state.model = event.model
        if (event.usage) state.usage = event.usage
        if (event.stopReason) state.stopReason = event.stopReason
        if (event.failure) state.failure = event.failure

        if (event.retry) {
          // The one record of how often pi retries behind the app's back — the diagnosis could pin
          // the mechanism but not the frequency.
          piLog.warn('pi is retrying the turn; dropping the text the failed attempt streamed', {
            meta: {
              attempt: event.retry.attempt,
              maxAttempts: event.retry.maxAttempts,
              delayMs: event.retry.delayMs
            }
          })
        }

        if (event.partEvent) {
          if (event.partEvent.kind === 'message-commit') committedLength = streamedLength
          else if (event.partEvent.kind === 'text-reset') streamedLength = committedLength

          yield {
            delta: '',
            done: false,
            partEvent: event.partEvent,
            provider: state.provider,
            model: state.model
          }
        }

        if (event.delta) {
          streamedLength += event.delta.length
          yield {
            delta: event.delta,
            done: false,
            provider: state.provider,
            model: state.model
          }
        }
      }

      const code = await exited
      // `pi --mode json` exits 0 however the run went — the non-zero path exists only in text mode —
      // so its own terminal state is the only trustworthy failure signal. Text that was never
      // committed does not rescue the run: it belongs to an attempt pi discarded, which is exactly
      // the case that used to surface as an unexplained empty bubble.
      if (!committedLength && isFailedStopReason(state.stopReason)) {
        throw new Error(
          `[PiCliProvider] pi ended the run without an answer: ${state.failure ?? state.stopReason}`
        )
      }

      // Deltas already reached the user, so a late non-zero exit must not discard them; the stream
      // closes on what did arrive instead of turning a partial answer into an error.
      if (code !== 0 && !streamedLength) {
        throw new Error(
          `[PiCliProvider] pi exited with code ${code}${stderrTail.trim() ? `: ${stderrTail.trim()}` : ''}`
        )
      }

      yield {
        delta: '',
        done: true,
        provider: state.provider,
        model: state.model,
        ...(state.usage ? { usage: state.usage } : {})
      }
    } finally {
      // Reached both on cancellation (the consumer breaks, which returns the generator) and on
      // failure. Without it a stopped turn leaves `pi` running and still billing.
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM')
      }
      child.stdout.destroy()
      // After the kill, so a cancelled run never has its images pulled out from under a `pi` that
      // is still reading them.
      await attachments.cleanup()
    }
  }

  async chat(
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<string>> {
    const startTime = Date.now()
    const traceId = this.generateTraceId()
    let content = ''
    // Same commit/rollback bookkeeping the streaming surfaces do, so a retried turn returns the
    // surviving answer rather than every attempt concatenated.
    let committedLength = 0
    let usage: IntelligenceUsageInfo | undefined
    let model: string | undefined

    for await (const chunk of this.chatStream(payload, options)) {
      if (chunk.partEvent?.kind === 'message-commit') committedLength = content.length
      else if (chunk.partEvent?.kind === 'text-reset') content = content.slice(0, committedLength)
      if (chunk.delta) content += chunk.delta
      if (chunk.usage) usage = chunk.usage
      if (chunk.model) model = chunk.model
    }

    return {
      result: content,
      usage: usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: model ?? this.resolveModel(options) ?? 'pi',
      latency: Date.now() - startTime,
      traceId,
      provider: this.type
    }
  }

  async translate(
    payload: IntelligenceTranslatePayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<string>> {
    const target = payload.targetLang
    const source = payload.sourceLang ? ` from ${payload.sourceLang}` : ''
    return this.chat(
      {
        messages: [
          {
            role: 'system',
            content: `Translate the user's text${source} into ${target}. Reply with the translation only.`
          },
          { role: 'user', content: payload.text }
        ]
      },
      options
    )
  }

  async embedding(
    _payload: IntelligenceEmbeddingPayload,
    _options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<number[]>> {
    // `pi` is a chat agent CLI with no embedding entry point. Failing loudly keeps the capability
    // router from silently binding embeddings to a provider that cannot serve them.
    throw new Error('[PiCliProvider] Embeddings are not supported by the pi CLI provider')
  }
}
