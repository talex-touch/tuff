import type {
  LocalAiCliAccess,
  LocalAiCliProviderCapabilities,
  LocalAiCliProviderId
} from '@talex-touch/utils/transport/events/local-ai-cli'

export interface LocalAiCliProviderDefinition {
  id: LocalAiCliProviderId
  label: string
  command: string
  fallbackCommands?: readonly string[]
  envOverride: string
  /** Subcommand/flag arguments that launch this provider in ACP stdio mode, when supported. */
  acpArgs?: readonly string[]
  /**
   * Matches this CLI's own `--version` output and nothing else's; the version is the first capture
   * group, or the whole match when there is none. A bare `\d+\.\d+\.\d+` also matches
   * `mise --version` (`2025.10.8 macos-arm64 …`), which is how a mise shim resolved to mise itself
   * passed as every one of these CLIs. pi prints only the number, so its pattern cannot carry a
   * name; it is safe because the lookup no longer resolves a shim to the binary behind it.
   */
  versionPattern: RegExp
  capabilities: LocalAiCliProviderCapabilities
}

export interface LocalAiCliTaskSpec {
  args: string[]
  stdin: string
  protocol?: 'pi-rpc' | 'codex-app-server' | 'acp'
  prompt?: string
  terminateOnComplete?: boolean
  /** Process environment overrides required to enforce the requested access policy at launch. */
  env?: Record<string, string>
  /** Optional ACP v1 `_meta` payload sent on `session/new`, `session/load`, and `session/resume`. */
  acpSessionMeta?: Record<string, unknown>
  /** Preferred read-only ACP mode IDs to apply when the agent advertises session modes. */
  acpModePreference?: readonly string[]
}

export interface LocalAiCliDecodedEvent {
  sessionId?: string
  delta?: string
  completeText?: string
  completed?: boolean
  failed?: boolean
}

export const LOCAL_AI_CLI_PROVIDERS: readonly LocalAiCliProviderDefinition[] = [
  {
    id: 'pi',
    label: 'Pi',
    command: 'pi',
    fallbackCommands: ['pie'],
    envOverride: 'TUFF_PI_CLI_PATH',
    versionPattern: /^\d+\.\d+\.\d+/m,
    capabilities: {
      taskRead: true,
      taskWriteApproval: false,
      terminalRead: true,
      terminalWriteApproval: false,
      taskResume: true,
      terminalResume: true
    }
  },
  {
    id: 'codex',
    label: 'Codex',
    command: 'codex',
    envOverride: 'TUFF_CODEX_CLI_PATH',
    versionPattern: /codex-cli\s+(\d+\.\d+\.\d+)/i,
    capabilities: {
      taskRead: true,
      taskWriteApproval: true,
      terminalRead: true,
      terminalWriteApproval: false,
      taskResume: true,
      terminalResume: true
    }
  },
  {
    id: 'claude',
    label: 'Claude Code',
    command: 'claude',
    envOverride: 'TUFF_CLAUDE_CLI_PATH',
    versionPattern: /(\d+\.\d+\.\d+)\s+\(Claude Code\)/i,
    capabilities: {
      taskRead: true,
      taskWriteApproval: true,
      terminalRead: true,
      terminalWriteApproval: false,
      taskResume: true,
      terminalResume: true
    }
  },
  {
    id: 'oh-my-pi',
    label: 'OMP',
    command: 'omp',
    envOverride: 'TUFF_OMP_CLI_PATH',
    acpArgs: ['acp'],
    versionPattern: /\bomp(?:\/|\s+v)(\d+\.\d+\.\d+)/i,
    capabilities: {
      taskRead: true,
      taskWriteApproval: true,
      terminalRead: true,
      terminalWriteApproval: false,
      taskResume: true,
      terminalResume: true
    }
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    command: 'agy',
    envOverride: 'TUFF_ANTIGRAVITY_CLI_PATH',
    acpArgs: ['acp'],
    versionPattern:
      /^[ \t]*(?:(?:agy|antigravity)[\s/]+)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)[ \t]*$/im,
    capabilities: {
      taskRead: true,
      taskWriteApproval: true,
      terminalRead: true,
      terminalWriteApproval: false,
      taskResume: true,
      terminalResume: false
    }
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    command: 'opencode',
    envOverride: 'TUFF_OPENCODE_CLI_PATH',
    acpArgs: ['acp'],
    versionPattern: /^[ \t]*(?:opencode[\s/]+)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)[ \t]*$/im,
    capabilities: {
      taskRead: true,
      taskWriteApproval: true,
      terminalRead: false,
      terminalWriteApproval: false,
      taskResume: true,
      terminalResume: false
    }
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    command: 'gemini',
    envOverride: 'TUFF_GEMINI_CLI_PATH',
    acpArgs: ['--experimental-acp'],
    versionPattern:
      /^[ \t]*(?:gemini(?:-cli)?[\s/]+)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)[ \t]*$/im,
    capabilities: {
      taskRead: true,
      taskWriteApproval: true,
      terminalRead: false,
      terminalWriteApproval: false,
      taskResume: false,
      terminalResume: false
    }
  },
  {
    id: 'kiro',
    label: 'Kiro',
    command: 'kiro-cli',
    fallbackCommands: ['kiro'],
    envOverride: 'TUFF_KIRO_CLI_PATH',
    acpArgs: ['acp'],
    versionPattern:
      /(?:kiro(?:-cli)?[\s/]+v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)|^[ \t]*v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)[ \t]*$)/im,
    capabilities: {
      taskRead: true,
      taskWriteApproval: true,
      terminalRead: false,
      terminalWriteApproval: false,
      taskResume: false,
      terminalResume: false
    }
  },
  {
    id: 'cursor',
    label: 'Cursor',
    command: 'cursor-agent',
    fallbackCommands: ['agent'],
    envOverride: 'TUFF_CURSOR_CLI_PATH',
    acpArgs: ['acp'],
    versionPattern:
      /^[ \t]*(?:(?:cursor-agent|cursor|agent)[\s/]+)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)[ \t]*$/im,
    capabilities: {
      taskRead: true,
      taskWriteApproval: true,
      terminalRead: true,
      terminalWriteApproval: false,
      taskResume: true,
      terminalResume: false
    }
  }
] as const

const DEFINITIONS = new Map(LOCAL_AI_CLI_PROVIDERS.map((provider) => [provider.id, provider]))

export function getLocalAiCliProviderDefinition(
  providerId: LocalAiCliProviderId
): LocalAiCliProviderDefinition {
  const definition = DEFINITIONS.get(providerId)
  if (!definition) throw new Error('LOCAL_AI_CLI_PROVIDER_INVALID')
  return definition
}
export function createLocalAiCliTaskSpec(
  provider: LocalAiCliProviderId,
  prompt: string,
  access: LocalAiCliAccess,
  nativeSessionId?: string
): LocalAiCliTaskSpec {
  switch (provider) {
    case 'pi':
      if (access === 'workspace-write') {
        throw new Error('LOCAL_AI_CLI_WRITE_APPROVAL_UNAVAILABLE')
      }
      return {
        args: [
          '--mode',
          'rpc',
          '--no-tools',
          '--no-extensions',
          '--no-skills',
          '--no-prompt-templates',
          '--no-context-files',
          ...(nativeSessionId ? ['--session', nativeSessionId] : [])
        ],
        stdin: `${JSON.stringify({ id: 'tuff-state', type: 'get_state' })}\n`,
        protocol: 'pi-rpc',
        prompt,
        terminateOnComplete: true
      }
    case 'oh-my-pi':
      return {
        args: [
          ...(access === 'workspace-write'
            ? ['--approval-mode', 'always-ask']
            : access === 'workspace-read'
              ? ['--tools', 'read,grep,glob']
              : ['--no-tools']),
          '--no-extensions',
          '--no-skills',
          '--no-rules',
          ...(getLocalAiCliProviderDefinition('oh-my-pi').acpArgs ?? ['acp'])
        ],
        stdin: '',
        protocol: 'acp',
        prompt,
        terminateOnComplete: true
      }
    case 'antigravity': {
      const baseArgs = [...(getLocalAiCliProviderDefinition('antigravity').acpArgs ?? ['acp'])]
      return {
        args: access === 'workspace-write' ? baseArgs : [...baseArgs, '--sandbox'],
        stdin: '',
        protocol: 'acp',
        prompt,
        terminateOnComplete: true,
        ...(access !== 'workspace-write' ? { acpModePreference: ['plan'] } : {})
      }
    }
    case 'opencode': {
      const baseArgs = [...(getLocalAiCliProviderDefinition('opencode').acpArgs ?? ['acp'])]
      const permissionPolicy =
        access === 'answer-only'
          ? { '*': 'deny' }
          : access === 'workspace-read'
            ? { '*': 'deny', read: 'allow', glob: 'allow', grep: 'allow', list: 'allow' }
            : { edit: 'ask', write: 'ask', bash: 'ask', patch: 'ask' }
      return {
        args: baseArgs,
        stdin: '',
        protocol: 'acp',
        prompt,
        terminateOnComplete: true,
        env: { OPENCODE_PERMISSION: JSON.stringify(permissionPolicy) },
        ...(access !== 'workspace-write' ? { acpModePreference: ['plan'] } : {})
      }
    }
    case 'gemini': {
      const baseArgs = [
        ...(getLocalAiCliProviderDefinition('gemini').acpArgs ?? ['--experimental-acp'])
      ]
      return {
        args: [...baseArgs, '--approval-mode', access === 'workspace-write' ? 'default' : 'plan'],
        stdin: '',
        protocol: 'acp',
        prompt,
        terminateOnComplete: true,
        ...(access !== 'workspace-write' ? { acpModePreference: ['plan'] } : {})
      }
    }
    case 'kiro': {
      const baseArgs = [...(getLocalAiCliProviderDefinition('kiro').acpArgs ?? ['acp'])]
      return {
        args: baseArgs,
        stdin: '',
        protocol: 'acp',
        prompt,
        terminateOnComplete: true,
        ...(access !== 'workspace-write'
          ? {
              acpSessionMeta: { kiro: { policyPreset: 'read-workspace' } },
              acpModePreference: ['plan', 'ask', 'read-only']
            }
          : {})
      }
    }
    case 'cursor': {
      const baseArgs = [...(getLocalAiCliProviderDefinition('cursor').acpArgs ?? ['acp'])]
      return {
        args:
          access === 'workspace-write'
            ? baseArgs
            : [
                '--mode',
                access === 'answer-only' ? 'ask' : 'plan',
                '--sandbox',
                'enabled',
                ...baseArgs
              ],
        stdin: '',
        protocol: 'acp',
        prompt,
        terminateOnComplete: true,
        ...(access !== 'workspace-write'
          ? { acpModePreference: access === 'answer-only' ? ['ask', 'plan'] : ['plan', 'ask'] }
          : {})
      }
    }
    case 'codex':
      return {
        args: [
          'app-server',
          '--stdio',
          '-c',
          `sandbox_mode="${access === 'workspace-write' ? 'workspace-write' : 'read-only'}"`,
          '-c',
          `approval_policy="${access === 'workspace-write' ? 'untrusted' : 'never'}"`
        ],
        stdin: `${JSON.stringify({
          id: 1,
          method: 'initialize',
          params: {
            clientInfo: { name: 'talex-touch', title: 'Talex Touch', version: '1' }
          }
        })}\n`,
        protocol: 'codex-app-server',
        prompt,
        terminateOnComplete: true
      }
    case 'claude':
      return {
        args: [
          '--print',
          '--input-format',
          'stream-json',
          '--output-format',
          'stream-json',
          '--include-partial-messages',
          '--verbose',
          '--tools',
          '',
          '--disable-slash-commands',
          '--permission-mode',
          'plan',
          '--no-chrome'
        ],
        stdin: `${JSON.stringify({
          type: 'user',
          message: { role: 'user', content: prompt }
        })}\n`
      }
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

export function decodeLocalAiCliEvent(
  provider: LocalAiCliProviderId,
  value: unknown
): LocalAiCliDecodedEvent {
  const event = asRecord(value)
  if (!event) return {}

  if (provider === 'codex') {
    const method = stringValue(event.method)
    const params = asRecord(event.params)
    const thread = asRecord(params?.thread)
    if (method === 'thread/started') {
      return { sessionId: stringValue(thread?.id) }
    }
    if (method === 'item/agentMessage/delta') {
      return { delta: stringValue(params?.delta) }
    }
    const item = asRecord(params?.item)
    if (method === 'item/completed' && item?.type === 'agentMessage') {
      const text = stringValue(item.text)
      return text ? { completeText: text } : {}
    }
    if (method === 'turn/completed') {
      const turn = asRecord(params?.turn)
      const error = asRecord(turn?.error)
      return {
        completed: turn?.status === 'completed',
        completeText: stringValue(error?.message)
      }
    }
    return {}
  }

  if (getLocalAiCliProviderDefinition(provider).acpArgs) {
    const method = stringValue(event.method)
    const params = asRecord(event.params)
    const update = asRecord(params?.update)
    const content = asRecord(update?.content)
    if (method === 'session/update' && update?.sessionUpdate === 'agent_message_chunk') {
      return content?.type === 'text' ? { delta: stringValue(content.text) } : {}
    }
    const result = asRecord(event.result)
    if (event.id === 3 && result?.stopReason) return { completed: true }
    return {}
  }

  if (provider === 'claude') {
    if (event.type === 'system' && event.subtype === 'init') {
      return { sessionId: stringValue(event.session_id) }
    }
    const nativeEvent = asRecord(event.event)
    const delta = asRecord(nativeEvent?.delta)
    if (
      event.type === 'stream_event' &&
      nativeEvent?.type === 'content_block_delta' &&
      delta?.type === 'text_delta'
    ) {
      return { delta: stringValue(delta.text) }
    }
    if (event.type === 'result') {
      return {
        sessionId: stringValue(event.session_id),
        completeText: stringValue(event.result),
        completed: event.subtype === 'success'
      }
    }
    return {}
  }

  if (event.type === 'session') return { sessionId: stringValue(event.id) }
  if (event.type === 'message_update') {
    const update = asRecord(event.assistantMessageEvent)
    if (update?.type === 'text_delta') return { delta: stringValue(update.delta) }
  }
  if (event.type === 'message_end') {
    const message = asRecord(event.message)
    if (message?.role === 'assistant') {
      const failed = message.stopReason === 'error' || message.stopReason === 'aborted'
      const text = Array.isArray(message.content)
        ? message.content
            .map((part) => asRecord(part))
            .filter((part) => part?.type === 'text')
            .map((part) => stringValue(part?.text) ?? '')
            .join('')
        : ''
      if (failed) return text ? { completeText: text, failed: true } : { failed: true }
      return text ? { completeText: text } : {}
    }
  }
  if (event.type === 'auto_retry_end' && event.success === false) {
    return { completed: true, failed: true }
  }
  const completed =
    event.type === 'agent_settled' || (event.type === 'agent_end' && event.willRetry !== true)
  if (!completed) return {}
  const lastAssistant =
    event.type === 'agent_end' && Array.isArray(event.messages)
      ? asRecord(event.messages.findLast((message) => asRecord(message)?.role === 'assistant'))
      : null
  return lastAssistant?.stopReason === 'error' || lastAssistant?.stopReason === 'aborted'
    ? { completed: true, failed: true }
    : { completed: true }
}

export function createLocalAiCliResumeArgs(
  provider: LocalAiCliProviderId,
  nativeSessionId: string
): string[] {
  switch (provider) {
    case 'pi':
      return ['--session', nativeSessionId]
    case 'oh-my-pi':
      return ['--resume', nativeSessionId]
    case 'codex':
      return ['resume', nativeSessionId]
    case 'claude':
      return ['--resume', nativeSessionId]
    case 'antigravity':
      return ['--conversation', nativeSessionId]
    case 'cursor':
      return ['--resume', nativeSessionId]
    case 'opencode':
    case 'gemini':
    case 'kiro':
      throw new Error('PROVIDER_RESUME_UNSUPPORTED')
  }
}
