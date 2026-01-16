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

export type DivisionBoxCloseRequest = {
  sessionId: string
  options?: CloseOptions
  _sdkapi?: number
}

export type DivisionBoxCloseResponse = IPCResponse<{ success: boolean }>

export type DivisionBoxGetStateRequest = {
  sessionId: string
  key?: string
  _sdkapi?: number
}

export type DivisionBoxGetStateResponse = IPCResponse<any>

export type DivisionBoxUpdateStateRequest = {
  sessionId: string
  key: string
  value: any
  _sdkapi?: number
}

export type DivisionBoxUpdateStateResponse = IPCResponse<{ success: boolean }>

export type DivisionBoxGetActiveSessionsRequest = {
  _sdkapi?: number
}

export type DivisionBoxGetActiveSessionsResponse = IPCResponse<SessionInfo[]>

export type DivisionBoxStateChangedPayload = StateChangeEvent

export type DivisionBoxSessionDestroyedPayload = { sessionId: string }

export type DivisionBoxTogglePinRequest = {
  sessionId: string
  _sdkapi?: number
}

export type DivisionBoxTogglePinResponse = IPCResponse<{ isPinned: boolean }>

export type DivisionBoxSetOpacityRequest = {
  sessionId: string
  opacity: number
  _sdkapi?: number
}

export type DivisionBoxSetOpacityResponse = IPCResponse<{ opacity: number }>

export type DivisionBoxToggleDevToolsRequest = {
  sessionId: string
  _sdkapi?: number
}

export type DivisionBoxToggleDevToolsResponse = IPCResponse<{ isOpen: boolean }>

export type DivisionBoxGetWindowStateRequest = {
  sessionId: string
  _sdkapi?: number
}

export type DivisionBoxGetWindowStateResponse = IPCResponse<{
  isPinned: boolean
  opacity: number
  isDevToolsOpen: boolean
}>

export type DivisionBoxInputChangeRequest = {
  sessionId: string
  input: string
  query: any
  _sdkapi?: number
}

export type DivisionBoxInputChangeResponse = IPCResponse<{ received: boolean }>

export type DivisionBoxFlowTriggerRequest = {
  targetId: string
  payload: FlowPayload
  _sdkapi?: number
}

export type DivisionBoxFlowTriggerResponse = IPCResponse<{ sessionId: string }>
