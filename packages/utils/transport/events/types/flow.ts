import type {
  FlowDispatchOptions,
  FlowDispatchResult,
  FlowPayload,
  FlowPayloadType,
  FlowSessionUpdate,
  FlowTargetInfo,
  NativeShareResult,
} from '../../../types/flow'

export type FlowDispatchRequest = {
  senderId?: string
  payload: FlowPayload
  options?: FlowDispatchOptions
  _sdkapi?: number
}

export type FlowDispatchResponse = {
  success: boolean
  data?: FlowDispatchResult
  error?: { message: string }
}

export type FlowGetTargetsRequest = {
  payloadType?: FlowPayloadType
  _sdkapi?: number
}

export type FlowGetTargetsResponse = {
  success: boolean
  data?: FlowTargetInfo[]
  error?: { message: string }
}

export type FlowSessionActionRequest = {
  sessionId: string
  _sdkapi?: number
}

export type FlowCancelResponse = {
  success: boolean
  data?: { cancelled: boolean }
  error?: { message: string }
}

export type FlowAcknowledgeRequest = {
  sessionId: string
  ackPayload?: any
  _sdkapi?: number
}

export type FlowAcknowledgeResponse = {
  success: boolean
  data?: { acknowledged: boolean }
  error?: { message: string }
}

export type FlowReportErrorRequest = {
  sessionId: string
  message: string
  _sdkapi?: number
}

export type FlowReportErrorResponse = {
  success: boolean
  data?: { reported: boolean }
  error?: { message: string }
}

export type FlowSetPluginHandlerRequest = {
  pluginId: string
  hasHandler: boolean
  _sdkapi?: number
}

export type FlowRegisterTargetsRequest = {
  pluginId: string
  targets: any[]
  pluginName?: string
  pluginIcon?: string
  isEnabled?: boolean
  _sdkapi?: number
}

export type FlowUnregisterTargetsRequest = {
  pluginId: string
  _sdkapi?: number
}

export type FlowSetPluginEnabledRequest = {
  pluginId: string
  enabled: boolean
  _sdkapi?: number
}

export type FlowNativeShareRequest = {
  payload: FlowPayload
  target?: string
  _sdkapi?: number
}

export type FlowNativeShareResponse = NativeShareResult

export type FlowSelectTargetRequest = {
  sessionId: string
  targetId: string | null
  _sdkapi?: number
}

export type FlowSelectTargetResponse = {
  success: boolean
  data?: { resolved: boolean }
  error?: { message: string }
}

export type FlowDeliverPayload = {
  sessionId: string
  payload: FlowPayload
  senderId: string
  senderName?: string
}

export type FlowSessionUpdatePayload = FlowSessionUpdate
