export const STREAM_CANCEL_EVENT_SUFFIX = ':stream:cancel'

export interface MissingHandlerPolicy {
  suppressWarning: boolean
  replyAsSuccess: boolean
  payload: {
    message: string
    reason: 'no_handler' | 'optional_stream_cancel'
    eventName: string
    channelType: string
  }
}

export function resolveMissingHandlerPolicy(params: {
  eventName: string
  channelType: string
}): MissingHandlerPolicy {
  const suppressWarning = params.eventName.endsWith(STREAM_CANCEL_EVENT_SUFFIX)

  return {
    suppressWarning,
    replyAsSuccess: suppressWarning,
    payload: {
      message: suppressWarning
        ? `Optional stream cancel ignored for "${params.eventName}"`
        : `No handler registered for "${params.eventName}"`,
      reason: suppressWarning ? 'optional_stream_cancel' : 'no_handler',
      eventName: params.eventName,
      channelType: params.channelType
    }
  }
}
