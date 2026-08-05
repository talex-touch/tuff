import type {
  LocalAiCliAccess,
  LocalAiCliProviderCapabilities,
  LocalAiCliProviderId
} from '@talex-touch/utils/transport/events/local-ai-cli'

export interface LocalAiCliProviderDefinition {
  id: LocalAiCliProviderId
  label: string
  command: string
  versionPattern: RegExp
  capabilities: LocalAiCliProviderCapabilities
}

export interface LocalAiCliTaskSpec {
  args: string[]
  stdin: string
  protocol?: 'pi-rpc' | 'codex-app-server' | 'omp-acp'
  prompt?: string
  terminateOnComplete?: boolean
}

export interface LocalAiCliDecodedEvent {
  sessionId?: string
  delta?: string
  completeText?: string
  completed?: boolean
}

export const LOCAL_AI_CLI_PROVIDERS: readonly LocalAiCliProviderDefinition[] = [
  {
    id: 'pi',
    label: 'Pi',
    command: 'pi',
    versionPattern: /^\d+\.\d+\.\d+/m,
    capabilities: {
      taskRead: true,
      taskWriteApproval: false,
      terminalRead: true,
      terminalWriteApproval: false,
      resume: true
    }
  },
  {
    id: 'codex',
    label: 'Codex',
    command: 'codex',
    versionPattern: /(?:codex-cli\s+)?\d+\.\d+\.\d+/i,
    capabilities: {
      taskRead: true,
      taskWriteApproval: true,
      terminalRead: true,
      terminalWriteApproval: false,
      resume: true
    }
  },
  {
    id: 'claude',
    label: 'Claude Code',
    command: 'claude',
    versionPattern: /\d+\.\d+\.\d+(?:\s+\(Claude Code\))?/i,
    capabilities: {
      taskRead: true,
      taskWriteApproval: true,
      terminalRead: true,
      terminalWriteApproval: false,
      resume: true
    }
  },
  {
    id: 'oh-my-pi',
    label: 'OMP',
    command: 'omp',
    versionPattern: /(?:omp\/?|omp v)?\d+\.\d+\.\d+/i,
    capabilities: {
      taskRead: true,
      taskWriteApproval: true,
      terminalRead: true,
      terminalWriteApproval: false,
      resume: true
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
  access: LocalAiCliAccess
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
          '--no-context-files'
        ],
        stdin: `${JSON.stringify({ type: 'prompt', message: prompt })}\n`,
        protocol: 'pi-rpc',
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
          'acp'
        ],
        stdin: `${JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: 1,
            clientCapabilities: {
              fs: { readTextFile: false, writeTextFile: false },
              terminal: false
            },
            clientInfo: { name: 'talex-touch', title: 'Talex Touch', version: '1' }
          }
        })}\n`,
        protocol: 'omp-acp',
        prompt,
        terminateOnComplete: true
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

  if (provider === 'oh-my-pi') {
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
    if (message?.role === 'assistant' && Array.isArray(message.content)) {
      const text = message.content
        .map((part) => asRecord(part))
        .filter((part) => part?.type === 'text')
        .map((part) => stringValue(part?.text) ?? '')
        .join('')
      return text ? { completeText: text } : {}
    }
  }
  return event.type === 'agent_end' || event.type === 'agent_settled' ? { completed: true } : {}
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
  }
}
