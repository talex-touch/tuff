import type {
  AcpPromptStreamOptions,
  AcpSessionCreateOptions,
  AcpSpawnOptions,
  AcpUsageUpdate,
  CliRuntimeToolCall,
} from '../acp/types'

export type {
  AcpAgentInfo,
  AcpClientInfo,
  AcpConfigOption,
  AcpInitializeParams,
  AcpInitializeResult,
  AcpKeyValueHeader,
  AcpMcpServerConfig,
  AcpPermissionOption,
  AcpPermissionRequestParams,
  AcpPermissionRequestResult,
  AcpPromptContent,
  AcpPromptResult,
  AcpPromptStreamOptions,
  AcpServerRequestHandler,
  AcpSessionCreateOptions,
  AcpSessionLoadParams,
  AcpSessionLoadResult,
  AcpSessionNewParams,
  AcpSessionNewResult,
  AcpSessionPromptParams,
  AcpSessionUpdateNotification,
  AcpSessionUpdateType,
  AcpSetConfigOptionParams,
  AcpSpawnOptions,
  AcpUsageUpdate,
} from '../acp/types'

export type OmpStreamToolCall = CliRuntimeToolCall

export interface OmpStreamEvent {
  type: 'thinking' | 'delta' | 'usage' | 'tool_call' | 'tool_result' | 'status'
  text?: string
  status?: string
  usage?: AcpUsageUpdate
  toolCall?: OmpStreamToolCall
  raw?: unknown
}

export interface OmpAcpSpawnOptions extends Omit<AcpSpawnOptions, 'executablePath'> {
  executablePath?: string
}

export type OmpPromptStreamOptions = AcpPromptStreamOptions

export type OmpSessionCreateOptions = AcpSessionCreateOptions
