import type { TuffEvent } from '../types'

export function defineRawEvent<TRequest = void, TResponse = void>(
  eventName: string,
): TuffEvent<TRequest, TResponse> {
  if (!eventName || typeof eventName !== 'string') {
    throw new Error('[tuff-intelligence] eventName must be a non-empty string.')
  }
  return Object.freeze({
    toEventName: () => eventName,
  }) as TuffEvent<TRequest, TResponse>
}

