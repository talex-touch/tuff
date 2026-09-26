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
import type { StoredLocalAiCliSession } from '../../local-ai-cli/session-store'
import type { PiSessionFileCapture } from '../../local-ai-cli/pi-native-session'
import type { LocalAiCliProviderId } from '@talex-touch/utils/transport/events/local-ai-cli'
import { randomUUID } from 'node:crypto'
import { mkdtemp, realpath, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { app } from 'electron'
import { createLogger } from '../../../utils/logger'
import { INTELLIGENCE_HOME_SURFACE } from '@talex-touch/utils/types/intelligence'
import { nativeSessionLeaseRegistry } from '../../local-ai-cli/native-session-lease'
import { isNativeSessionMissingError } from '../../local-ai-cli/native-session-errors'
import { findPiNativeSessionFile } from '../../local-ai-cli/native-session-discovery'
import {
  capturePiSessionFile,
  readPiSessionFileHead,
  verifyPiLinearFileAppend
} from '../../local-ai-cli/pi-native-session'
import {
  getLocalAiCliSessionForConversation,
  markLocalAiCliSessionState,
  touchLocalAiCliSession,
  upsertLocalAiCliSession
} from '../../local-ai-cli/session-store'
import { getLocalAiCliWorkspaceRoot } from '../../local-ai-cli/workspace-root'
import { getProject } from '../../project/project-store'
import { readReasoningPlan } from '../reasoning-effort-runtime'
import { IntelligenceProvider } from '../runtime/base-provider'
import { collectMessageAttachments } from './attachment-spill'
import { runCliChat } from './cli/cli-process-runtime'
import { createClaudeLineParser } from './cli/claude-stream-json'
import { createCodexLineParser } from './cli/codex-exec-json'
import {
  buildOmpArgs,
  buildPiArgs,
  buildPiPrompt,
  CLAUDE_CLI_ORIGIN,
  CLAUDE_CLI_PROVIDER_ID,
  cliReasoningLevel,
  CODEX_CLI_ORIGIN,
  CODEX_CLI_PROVIDER_ID,
  OMP_CLI_ORIGIN,
  OMP_CLI_PROVIDER_ID,
  PI_CLI_TERMINATION_FAILED,
  PI_SESSION_PROTOCOL_VERSION,
  parsePiCliLine,
  readPiSessionInfo,
  readPiSessionProtocolVersion,
  resolveClaudeExecutable,
  resolveCodexExecutable,
  resolveOmpExecutable,
  resolvePiExecutable
} from './pi-cli-runtime'
const piCliLog = createLogger('Intelligence').child('PiCli')
const activeHomeConversations = new Set<string>()

function acquireHomeConversationLease(conversationId: string): () => void {
  if (activeHomeConversations.has(conversationId)) throw new Error('NATIVE_SESSION_BUSY')
  activeHomeConversations.add(conversationId)
  let released = false
  return () => {
    if (released) return
    released = true
    activeHomeConversations.delete(conversationId)
  }
}

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

interface PiHomeSessionContext {
  conversationId: string
  projectId: string | null
}

function opaqueId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Z0-9-]{1,128}$/i.test(value) ? value : null
}

function resolveHomeSessionContext(
  options: IntelligenceInvokeOptions
): PiHomeSessionContext | null {
  const metadata = options.metadata
  if (metadata?.surface !== INTELLIGENCE_HOME_SURFACE) return null
  if (typeof metadata.caller === 'string' && metadata.caller) {
    throw new Error('PI_NATIVE_SESSION_CONTEXT_INVALID')
  }
  const conversationId = opaqueId(metadata.conversationId)
  const projectId = metadata.projectId === null ? null : opaqueId(metadata.projectId)
  if (!conversationId || (metadata.projectId !== null && !projectId)) {
    throw new Error('PI_NATIVE_SESSION_CONTEXT_INVALID')
  }
  return { conversationId, projectId }
}

async function resolveHomeSessionRoot(projectId: string | null): Promise<string> {
  const storedRoot = projectId
    ? (await getProject(projectId))?.rootPath
    : getLocalAiCliWorkspaceRoot()
  if (!storedRoot) throw new Error('WORKSPACE_INVALID')
  try {
    const canonicalRoot = await realpath(storedRoot)
    const details = await stat(canonicalRoot)
    if (!details.isDirectory() || (projectId && canonicalRoot !== storedRoot)) {
      throw new Error('WORKSPACE_INVALID')
    }
    return canonicalRoot
  } catch (error) {
    if (error instanceof Error && error.message === 'WORKSPACE_INVALID') throw error
    throw new Error('WORKSPACE_INVALID')
  }
}

function firstUserPrompt(payload: IntelligenceChatPayload): string {
  return payload.messages.find((message) => message.role === 'user')?.content ?? ''
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

    const isOmp =
      this.config.id === OMP_CLI_PROVIDER_ID || this.config.metadata?.origin === OMP_CLI_ORIGIN
    const isCodex =
      this.config.id === CODEX_CLI_PROVIDER_ID || this.config.metadata?.origin === CODEX_CLI_ORIGIN
    const isClaude =
      this.config.id === CLAUDE_CLI_PROVIDER_ID ||
      this.config.metadata?.origin === CLAUDE_CLI_ORIGIN

    let executable: string | null = null
    let cliName = 'pi'
    let errorPrefix = '[PiCliProvider]'
    let localProviderId: LocalAiCliProviderId = 'pi'

    if (isOmp) {
      executable = await resolveOmpExecutable()
      cliName = 'omp'
      errorPrefix = '[OmpCliProvider]'
      localProviderId = 'oh-my-pi'
    } else if (isCodex) {
      executable = await resolveCodexExecutable()
      cliName = 'codex'
      errorPrefix = '[CodexCliProvider]'
      localProviderId = 'codex'
    } else if (isClaude) {
      executable = await resolveClaudeExecutable()
      cliName = 'claude'
      errorPrefix = '[ClaudeCliProvider]'
      localProviderId = 'claude'
    } else {
      executable = await resolvePiExecutable()
    }

    if (!executable) {
      throw new Error(
        `${errorPrefix} ${cliName.toUpperCase()}_CLI_NOT_FOUND: the '${cliName}' CLI was not found on this machine`
      )
    }
    const home = resolveHomeSessionContext(options)
    // Native continuation is `pi`'s protocol. `omp` has no `--session`/`--session-id`, and
    // `codex exec --ephemeral` / `claude -p --no-session-persistence` keep no session either, so
    // their home-surface turns rebuild the transcript instead of reading the session store.
    const isPi = !isOmp && !isCodex && !isClaude
    const nativeSession = home && isPi ? home : null
    const cwd = nativeSession ? await resolveHomeSessionRoot(nativeSession.projectId) : undefined
    let pointer: StoredLocalAiCliSession | null = nativeSession
      ? await getLocalAiCliSessionForConversation(nativeSession.conversationId)
      : null
    if (nativeSession && pointer) {
      if (
        pointer.provider !== localProviderId ||
        pointer.projectId !== nativeSession.projectId ||
        pointer.projectRoot !== cwd
      ) {
        throw new Error('NATIVE_SESSION_CONFLICT')
      }
      if (pointer.state === 'missing') throw new Error('NATIVE_SESSION_MISSING')
      if (pointer.state === 'conflict') throw new Error('NATIVE_SESSION_CONFLICT')
    }

    const nativeSessionId = nativeSession ? (pointer?.nativeSessionId ?? randomUUID()) : undefined
    let releaseNativeLease: (() => void) | undefined
    let fileCapture: PiSessionFileCapture | null = null
    let capturedHead: string | null = null
    // `codex` and `claude` still read AGENTS.md / CLAUDE.md out of their working directory, so a run
    // started from the app's launch directory would feed unrelated repository rules into the chat.
    // The throwaway directory is the whole isolation — removed in `finally`, whatever the turn did.
    const isolationRoot =
      isCodex || isClaude ? await mkdtemp(join(tmpdir(), 'tuff-cli-')) : undefined
    // Taken only once there is nothing left to fail before the guarded block: the lease is released
    // in the `finally` below, so taking it ahead of a call that can reject would strand the thread
    // in NATIVE_SESSION_BUSY until the app restarted.
    const releaseConversationLease = home
      ? acquireHomeConversationLease(home.conversationId)
      : undefined

    try {
      if (nativeSession && cwd && pointer) {
        releaseNativeLease = nativeSessionLeaseRegistry.acquire({
          provider: localProviderId,
          projectRoot: cwd,
          nativeSessionId: pointer.nativeSessionId
        })
      }
      if (nativeSession && pointer) {
        const sessionFile = await findPiNativeSessionFile(pointer.nativeSessionId)
        if (!sessionFile) {
          await markLocalAiCliSessionState(pointer.id, 'missing')
          throw new Error('NATIVE_SESSION_MISSING')
        }
        fileCapture = await capturePiSessionFile(sessionFile, pointer.nativeSessionId, cwd!)
        capturedHead = await readPiSessionFileHead(fileCapture)
        if (capturedHead !== pointer.expectedHeadId) throw new Error('NATIVE_SESSION_CONFLICT')
      }

      // The answer-only CLIs run tool-less by argv (`--no-tools`, `-c mcp_servers={}`,
      // `--tools ""`), so the tool prompt and the gateway env would advertise capabilities the run
      // cannot use.
      const toolRuntime = isPi ? (resolveToolRuntime?.() ?? null) : null
      const toolsGranted = (toolRuntime?.tools.length ?? 0) > 0
      const prompt = buildPiPrompt(payload.messages, {
        toolsGranted,
        nativeContinuation: Boolean(pointer)
      })
      const model = this.resolveModel(options)
      // Main's plan, on this CLI's own wire only; auto leaves every argv below unchanged.
      const reasoningPlan = readReasoningPlan(options)
      const thinkingLevel = cliReasoningLevel(reasoningPlan, 'cli-thinking')
      const codexEffort = cliReasoningLevel(reasoningPlan, 'codex-config')
      const claudeEffort = cliReasoningLevel(reasoningPlan, 'claude-effort')
      const toolOptions =
        toolRuntime || nativeSessionId
          ? {
              ...(toolRuntime
                ? {
                    tools: toolRuntime.tools,
                    extensionPath: resolveTuffExtensionPath() ?? undefined
                  }
                : {}),
              ...(nativeSessionId
                ? { session: { id: nativeSessionId, create: pointer === null } }
                : {})
            }
          : undefined
      let sessionObserved = !nativeSession

      const stream = runCliChat(
        {
          name: cliName,
          errorPrefix,
          executable,
          args: isOmp
            ? (attachmentPaths) => buildOmpArgs(prompt, model, attachmentPaths, thinkingLevel)
            : isCodex && isolationRoot
              ? (attachmentPaths) => [
                  'exec',
                  '--json',
                  '--ephemeral',
                  '--skip-git-repo-check',
                  '--ignore-rules',
                  '-s',
                  'read-only',
                  '-C',
                  isolationRoot,
                  '--color',
                  'never',
                  // The user's own MCP servers must not ride into the app's headless run. The flag
                  // that would also drop their `model_provider` (`--ignore-user-config`) is not used.
                  '-c',
                  'mcp_servers={}',
                  // Codex has no effort flag; a `-c` override beats the user's own
                  // `model_reasoning_effort` for this run only. Quoted so it parses as a TOML string.
                  ...(codexEffort ? ['-c', `model_reasoning_effort="${codexEffort}"`] : []),
                  ...(model ? ['-m', model] : []),
                  // Attachments are images only: the spill writes png/jpg/webp/gif and nothing else.
                  ...attachmentPaths.flatMap((path) => ['-i', path]),
                  // `exec --json` has no system-prompt flag, so the system text rides in front.
                  `${prompt.systemPrompt}\n\n---\n\n${prompt.prompt}`
                ]
              : isClaude
                ? (attachmentPaths) => {
                    // Claude Code's headless run takes no image input, and answering anyway reads
                    // as though the model had seen the picture. Refuse the turn before the child
                    // starts rather than drop it and answer a question that was never asked.
                    if (attachmentPaths.length > 0) {
                      throw new Error(
                        `${errorPrefix} ATTACHMENTS_UNSUPPORTED: the '${cliName}' CLI takes no image input`
                      )
                    }
                    return [
                      '-p',
                      '--output-format',
                      'stream-json',
                      '--verbose',
                      '--include-partial-messages',
                      '--no-session-persistence',
                      '--strict-mcp-config',
                      '--setting-sources',
                      '',
                      '--tools',
                      '',
                      '--disable-slash-commands',
                      '--no-chrome',
                      '--system-prompt',
                      prompt.systemPrompt,
                      ...(model ? ['--model', model] : []),
                      ...(claudeEffort ? ['--effort', claudeEffort] : []),
                      prompt.prompt
                    ]
                  }
                : (attachmentPaths) =>
                    buildPiArgs(prompt, model, toolOptions, attachmentPaths, thinkingLevel),
          ...(isolationRoot ? { cwd: isolationRoot } : cwd ? { cwd } : {}),
          ...(nativeSession && nativeSessionId
            ? {
                onLine: async (line: string) => {
                  const session = readPiSessionInfo(line)
                  if (!session) return
                  if (session.version !== PI_SESSION_PROTOCOL_VERSION) {
                    throw new Error('PROVIDER_RESUME_UNSUPPORTED')
                  }
                  if (session.id !== nativeSessionId) {
                    throw new Error(pointer ? 'NATIVE_SESSION_MISSING' : 'NATIVE_SESSION_CONFLICT')
                  }
                  if (!pointer) {
                    releaseNativeLease = nativeSessionLeaseRegistry.acquire({
                      provider: localProviderId,
                      projectRoot: cwd!,
                      nativeSessionId
                    })
                    pointer = await upsertLocalAiCliSession({
                      conversationId: nativeSession.conversationId,
                      projectId: nativeSession.projectId,
                      provider: localProviderId,
                      projectRoot: cwd!,
                      nativeSessionId,
                      prompt: firstUserPrompt(payload)
                    })
                  }
                  sessionObserved = true
                }
              }
            : {}),
          env: {
            PI_RETRY_STALL_TIMEOUT_MS: '0',
            ...(toolRuntime
              ? {
                  TUFF_TOOL_GATEWAY_URL: toolRuntime.url,
                  TUFF_TOOL_GATEWAY_TOKEN: toolRuntime.token
                }
              : {})
          },
          parseLine: isCodex
            ? createCodexLineParser()
            : isClaude
              ? createClaudeLineParser()
              : createPiLineParser(),
          terminationErrorCode: PI_CLI_TERMINATION_FAILED,
          logger: piCliLog
        },
        { signal, attachments: collectMessageAttachments(payload.messages) }
      )
      for await (const chunk of stream) yield chunk
      if (signal?.aborted) return

      if (nativeSession) {
        if (!sessionObserved || !pointer) throw new Error('PROTOCOL_INVALID')
        let finalHead: string | null
        if (fileCapture) {
          finalHead = await verifyPiLinearFileAppend({ capture: fileCapture, capturedHead })
        } else {
          const sessionFile = await findPiNativeSessionFile(pointer.nativeSessionId)
          if (!sessionFile) throw new Error('NATIVE_SESSION_CONFLICT')
          const completedFile = await capturePiSessionFile(
            sessionFile,
            pointer.nativeSessionId,
            cwd!
          )
          finalHead = await readPiSessionFileHead(completedFile)
        }
        if (!finalHead) throw new Error('NATIVE_SESSION_CONFLICT')
        await touchLocalAiCliSession(pointer.id, finalHead)
      }
    } catch (error) {
      if (pointer && error instanceof Error && error.message === 'NATIVE_SESSION_CONFLICT') {
        await markLocalAiCliSessionState(pointer.id, 'conflict')
      } else if (
        pointer &&
        ((error instanceof Error && error.message === 'NATIVE_SESSION_MISSING') ||
          isNativeSessionMissingError(error))
      ) {
        await markLocalAiCliSessionState(pointer.id, 'missing')
        throw new Error('NATIVE_SESSION_MISSING')
      }
      throw error
    } finally {
      if (isolationRoot) await rm(isolationRoot, { recursive: true, force: true }).catch(() => {})
      releaseNativeLease?.()
      releaseConversationLease?.()
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
