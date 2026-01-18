import type { ITuffTransport, TuffEvent } from '@talex-touch/utils/transport'
import { useDebounceFn } from '@vueuse/core'

interface TransportOptions<TPayload, TResponse> {
  event: TuffEvent<TPayload, TResponse>
  debounceMs?: number
  onError?: (error: unknown) => void
}

export interface CoreBoxTransport<TPayload> {
  dispatch: (payload: TPayload) => void
}

export function createCoreBoxTransport<TPayload, TResponse = void>(
  transport: ITuffTransport,
  options: TransportOptions<TPayload, TResponse>
): CoreBoxTransport<TPayload> {
  const { event, debounceMs, onError } = options
  const eventName = event.toEventName()

  const maybeDebounce = <T extends (...args: any[]) => void>(fn: T): T => {
    if (!debounceMs) return fn

    return useDebounceFn(fn, debounceMs) as unknown as T
  }

  const emit = maybeDebounce((payload: TPayload) => {
    transport.send(event, payload as TPayload).catch((error: unknown) => {
      if (onError) {
        onError(error)
      } else {
        console.error(`[coreBoxTransport] Failed to send ${eventName}:`, error)
      }
    })
  })

  return {
    dispatch(payload: TPayload) {
      emit(payload)
    }
  }
}
