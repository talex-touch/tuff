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
import { createInterface } from 'node:readline'
import { dirname, delimiter } from 'node:path'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { IntelligenceProvider } from '../runtime/base-provider'
import {
  buildPiArgs,
  buildPiPrompt,
  parsePiCliLine,
  PI_CLI_NOT_FOUND,
  resolvePiExecutable
} from './pi-cli-runtime'

/** Enough stderr to identify a failure without letting a chatty run grow unbounded in memory. */
const STDERR_TAIL_LIMIT = 4_000

interface PiRunState {
  provider?: string
  model?: string
  usage?: IntelligenceUsageInfo
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
    options: IntelligenceInvokeOptions
  ): Promise<ChildProcessByStdio<null, Readable, Readable>> {
    const executable = await resolvePiExecutable()
    if (!executable) {
      throw new Error(
        `[PiCliProvider] ${PI_CLI_NOT_FOUND}: the 'pi' CLI was not found on this machine`
      )
    }

    const args = buildPiArgs(buildPiPrompt(payload.messages), this.resolveModel(options))

    return spawn(executable, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // `pi` is a `#!/usr/bin/env node` script and version managers keep `node` beside it. A GUI
        // launch inherits a PATH that contains neither, so without this the shebang fails to resolve
        // even though the binary itself was found by absolute path.
        PATH: [dirname(executable), process.env.PATH].filter(Boolean).join(delimiter)
      }
    })
  }

  async *chatStream(
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions
  ): AsyncGenerator<IntelligenceStreamChunk> {
    const child = await this.spawnPi(payload, options)
    const state: PiRunState = {}
    let emittedDelta = false
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

        if (event.delta) {
          emittedDelta = true
          yield {
            delta: event.delta,
            done: false,
            provider: state.provider,
            model: state.model
          }
        }
      }

      const code = await exited
      // Deltas already reached the user, so a late non-zero exit must not discard them; the stream
      // closes on what did arrive instead of turning a partial answer into an error.
      if (code !== 0 && !emittedDelta) {
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
    }
  }

  async chat(
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions
  ): Promise<IntelligenceInvokeResult<string>> {
    const startTime = Date.now()
    const traceId = this.generateTraceId()
    let content = ''
    let usage: IntelligenceUsageInfo | undefined
    let model: string | undefined

    for await (const chunk of this.chatStream(payload, options)) {
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
