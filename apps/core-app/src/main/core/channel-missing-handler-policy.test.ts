import { describe, expect, it } from 'vitest'
import {
  STREAM_CANCEL_EVENT_SUFFIX,
  resolveMissingHandlerPolicy
} from './channel-missing-handler-policy'

describe('resolveMissingHandlerPolicy', () => {
  it('downgrades optional stream cancel requests', () => {
    const policy = resolveMissingHandlerPolicy({
      eventName: `pilot:chat${STREAM_CANCEL_EVENT_SUFFIX}`,
      channelType: 'main'
    })

    expect(policy).toEqual({
      suppressWarning: true,
      replyAsSuccess: true,
      payload: {
        message: `Optional stream cancel ignored for "pilot:chat${STREAM_CANCEL_EVENT_SUFFIX}"`,
        reason: 'optional_stream_cancel',
        eventName: `pilot:chat${STREAM_CANCEL_EVENT_SUFFIX}`,
        channelType: 'main'
      }
    })
  })

  it('keeps normal missing handlers as warnings', () => {
    const policy = resolveMissingHandlerPolicy({
      eventName: 'plugin:invoke',
      channelType: 'plugin'
    })

    expect(policy).toEqual({
      suppressWarning: false,
      replyAsSuccess: false,
      payload: {
        message: 'No handler registered for "plugin:invoke"',
        reason: 'no_handler',
        eventName: 'plugin:invoke',
        channelType: 'plugin'
      }
    })
  })
})
