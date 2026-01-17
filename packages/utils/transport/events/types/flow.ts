import type {
  FlowDispatchOptions,
  FlowDispatchResult,
  FlowPayload,
  FlowPayloadType,
  FlowSessionUpdate,
  FlowTargetInfo,
  NativeShareResult,
} from '../../../types/flow'

export interface FlowDispatchRequest {
  senderId?: string
  payload: FlowPayload
  options?: FlowDispatchOptions
  _sdkapi?: number
}

export interface FlowDispatchResponse {
  success: boolean
  data?: FlowDispatchResult
  error?: { message: string }
}

export interface FlowGetTargetsRequest {
  payloadType?: FlowPayloadType
  _sdkapi?: number
}

export interface FlowGetTargetsResponse {
  success: boolean
  data?: FlowTargetInfo[]
  error?: { message: string }
}

export interface FlowSessionActionRequest {
  sessionId: string
  _sdkapi?: number
}

export interface FlowCancelResponse {
  success: boolean
  data?: { cancelled: boolean }
  error?: { message: string }
}

export interface FlowAcknowledgeRequest {
  sessionId: string
  ackPayload?: any
  _sdkapi?: number
}

export interface FlowAcknowledgeResponse {
  success: boolean
  data?: { acknowledged: boolean }
  error?: { message: string }
}

export interface FlowReportErrorRequest {
  sessionId: string
  message: string
  _sdkapi?: number
}

export interface FlowReportErrorResponse {
  success: boolean
  data?: { reported: boolean }
  error?: { message: string }
}

export interface FlowSetPluginHandlerRequest {
  pluginId: string
  hasHandler: boolean
  _sdkapi?: number
}

export interface FlowRegisterTargetsRequest {
  pluginId: string
  targets: any[]
  pluginName?: string
  pluginIcon?: string
  isEnabled?: boolean
  _sdkapi?: number
}

export interface FlowUnregisterTargetsRequest {
  pluginId: string
  _sdkapi?: number
}

export interface FlowSetPluginEnabledRequest {
  pluginId: string
  enabled: boolean
  _sdkapi?: number
}

export interface FlowNativeShareRequest {
  payload: FlowPayload
  target?: string
  _sdkapi?: number
}

export type FlowNativeShareResponse = NativeShareResult

export interface FlowSelectTargetRequest {
  sessionId: string
  targetId: string | null
  _sdkapi?: number
}

export interface FlowSelectTargetResponse {
  success: boolean
  data?: { resolved: boolean }
  error?: { message: string }
}

export interface FlowDeliverPayload {
  sessionId: string
  payload: FlowPayload
  senderId: string
  senderName?: string
}

export type FlowSessionUpdatePayload = FlowSessionUpdate
