import type {
  IntelligenceChatPayload,
  IntelligenceEmbeddingPayload,
  IntelligenceInvokeOptions,
  IntelligenceInvokeResult,
  IntelligenceStreamChunk,
  IntelligenceTranslatePayload,
  IntelligenceUsageInfo
} from '@talex-touch/tuff-intelligence'
import type { CliLineEvent } from './cli/cli-process-runtime'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { app } from 'electron'
import { createLogger } from '../../../utils/logger'
import { IntelligenceProvider } from '../runtime/base-provider'
import { collectMessageAttachments } from './attachment-spill'
import { runCliChat } from './cli/cli-process-runtime'
import {
  buildPiArgs,
  buildPiPrompt,
  parsePiCliLine,
  PI_CLI_NOT_FOUND,
  PI_CLI_TERMINATION_FAILED,
  PI_SESSION_PROTOCOL_VERSION,
  readPiSessionProtocolVersion,
  resolvePiExecutable
} from './pi-cli-runtime'

const piCliLog = createLogger('Intelligence').child('PiCli')

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

/**
 * Tuff's tool forwarder, handed to `pi` per spawn via `-e`. Nothing is ever
 * installed into the user's own pi setup — the file rides along from the
 * repo in development and from `extraResources` in a packaged build. `null`
 * (cached) when neither exists: the run then degrades to tool-free, which the
 * model can at least say out loud, instead of silently mangling the spawn.
 */
let tuffExtensionPath: string | null | undefined

function resolveTuffExtensionPath(): string | null {
  if (tuffExtensionPath !== undefined) return tuffExtensionPath
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'pi-extension-tuff', 'index.ts')]
    : [join(app.getAppPath(), '..', '..', 'packages', 'pi-extension-tuff', 'index.ts')]
  tuffExtensionPath = candidates.find((candidate) => existsSync(candidate)) ?? null
  if (!tuffExtensionPath) {
    piCliLog.warn(
      `Tuff pi extension not found (looked at: ${candidates.join(', ')}) — runs stay tool-free`
    )
  }
  return tuffExtensionPath
}

type PiCliRuntimeOptions = IntelligenceInvokeOptions & {
  readonly signal?: AbortSignal
}

/**
 * Per-run line parser: `parsePiCliLine` behind a one-shot protocol check.
 *
 * `pi` is an external CLI with no version constraint in this repo, so an upgrade can change the
 * stream contract with nothing to announce it. Its first line carries the protocol version; a
 * mismatch means the shapes this provider parses were read off a different protocol than the one
 * now running (#970).
 *
 * Warn rather than fail: the parser degrades to skipping lines it does not recognise, and refusing
 * to answer because a number moved would be worse than a partial reply. Once per run -- this is a
 * diagnostic, not a stream annotation.
 */
function createPiLineParser(): (line: string) => CliLineEvent | null {
  let protocolChecked = false
  return (line) => {
    if (!protocolChecked) {
      const protocolVersion = readPiSessionProtocolVersion(line)
      if (protocolVersion !== null) {
        protocolChecked = true
        if (protocolVersion !== PI_SESSION_PROTOCOL_VERSION) {
          piCliLog.warn(
            'pi session protocol version differs from the one this parser was written against',
            {
              meta: { observed: protocolVersion, expected: PI_SESSION_PROTOCOL_VERSION }
            }
          )
        }
      }
    }
    return parsePiCliLine(line)
  }
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

  async *chatStream(
    payload: IntelligenceChatPayload,
    options: IntelligenceInvokeOptions
  ): AsyncGenerator<IntelligenceStreamChunk> {
    const signal = (options as PiCliRuntimeOptions).signal
    if (signal?.aborted) return

    // Resolved before anything is written for the run: a missing CLI has nothing to clean up.
    const executable = await resolvePiExecutable()
    if (!executable) {
      throw new Error(
        `[PiCliProvider] ${PI_CLI_NOT_FOUND}: the 'pi' CLI was not found on this machine`
      )
    }

    const toolRuntime = resolveToolRuntime?.() ?? null
    const toolsGranted = (toolRuntime?.tools.length ?? 0) > 0
    const prompt = buildPiPrompt(payload.messages, { toolsGranted })
    const model = this.resolveModel(options)
    const toolOptions = toolRuntime
      ? { tools: toolRuntime.tools, extensionPath: resolveTuffExtensionPath() ?? undefined }
      : undefined

    yield* runCliChat(
      {
        name: 'pi',
        errorPrefix: '[PiCliProvider]',
        executable,
        args: (attachmentPaths) => buildPiArgs(prompt, model, toolOptions, attachmentPaths),
        env: {
          // Defence in depth against duplicated answers. The `pi-retry` extension aborts a stream
          // that goes 90s without a token and hands the turn to pi's auto-retry — a watchdog built
          // for the interactive TUI, where a "retrying" banner explains the pause. Here nobody sees
          // it, so it only produces a second copy of the answer. The runtime's commit/rollback
          // handling survives a retry either way; this stops provoking them.
          PI_RETRY_STALL_TIMEOUT_MS: '0',
          // The extension reads these to reach back into the app. Absent them it
          // registers nothing, so a stale `--tools` list can't grant anything.
          ...(toolRuntime
            ? {
                TUFF_TOOL_GATEWAY_URL: toolRuntime.url,
                TUFF_TOOL_GATEWAY_TOKEN: toolRuntime.token
              }
            : {})
        },
        parseLine: createPiLineParser(),
        terminationErrorCode: PI_CLI_TERMINATION_FAILED,
        logger: piCliLog
      },
      { signal, attachments: collectMessageAttachments(payload.messages) }
    )
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
