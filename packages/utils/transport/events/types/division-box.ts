import type {
  CloseOptions,
  DivisionBoxConfig,
  IPCResponse,
  SessionInfo,
  StateChangeEvent,
} from '../../../types/division-box'
import type { FlowPayload } from '../../../types/flow'

export type DivisionBoxOpenRequest = DivisionBoxConfig & {
  _sdkapi?: number
}

export type DivisionBoxOpenResponse = IPCResponse<SessionInfo>

export interface DivisionBoxCloseRequest {
  sessionId: string
  options?: CloseOptions
  _sdkapi?: number
}

export type DivisionBoxCloseResponse = IPCResponse<{ success: boolean }>

export interface DivisionBoxGetStateRequest {
  sessionId: string
  key?: string
  _sdkapi?: number
}

export type DivisionBoxGetStateResponse = IPCResponse<any>

export interface DivisionBoxUpdateStateRequest {
  sessionId: string
  key: string
  value: any
  _sdkapi?: number
}

export type DivisionBoxUpdateStateResponse = IPCResponse<{ success: boolean }>

export interface DivisionBoxGetActiveSessionsRequest {
  _sdkapi?: number
}

export type DivisionBoxGetActiveSessionsResponse = IPCResponse<SessionInfo[]>

export type DivisionBoxStateChangedPayload = StateChangeEvent

export interface DivisionBoxSessionDestroyedPayload { sessionId: string }

export interface DivisionBoxTogglePinRequest {
  sessionId: string
  _sdkapi?: number
}

export type DivisionBoxTogglePinResponse = IPCResponse<{ isPinned: boolean }>

export interface DivisionBoxSetOpacityRequest {
  sessionId: string
  opacity: number
  _sdkapi?: number
}

export type DivisionBoxSetOpacityResponse = IPCResponse<{ opacity: number }>

export interface DivisionBoxToggleDevToolsRequest {
  sessionId: string
  _sdkapi?: number
}

export type DivisionBoxToggleDevToolsResponse = IPCResponse<{ isOpen: boolean }>

export interface DivisionBoxGetWindowStateRequest {
  sessionId: string
  _sdkapi?: number
}

export type DivisionBoxGetWindowStateResponse = IPCResponse<{
  isPinned: boolean
  opacity: number
  isDevToolsOpen: boolean
}>

export interface DivisionBoxInputChangeRequest {
  sessionId: string
  input: string
  query: any
  _sdkapi?: number
}

export type DivisionBoxInputChangeResponse = IPCResponse<{ received: boolean }>

export interface DivisionBoxFlowTriggerRequest {
  targetId: string
  payload: FlowPayload
  _sdkapi?: number
}

export type DivisionBoxFlowTriggerResponse = IPCResponse<{ sessionId: string }>
