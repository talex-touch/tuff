import type { ITouchClientChannel } from '@talex-touch/utils'
import { useDebounceFn } from '@vueuse/core'

interface TransportOptions {
  event: string
  debounceMs?: number
  onError?: (error: unknown) => void
}

export interface CoreBoxTransport<TPayload> {
  dispatch: (payload: TPayload) => void
}

export function createCoreBoxTransport<TPayload>(
  channel: ITouchClientChannel,
  options: TransportOptions
): CoreBoxTransport<TPayload> {
  const { event, debounceMs, onError } = options

  const maybeDebounce = <T extends (...args: any[]) => void>(fn: T): T => {
    if (!debounceMs) return fn

    return useDebounceFn(fn, debounceMs) as unknown as T
  }

  const emit = maybeDebounce((payload: TPayload) => {
    channel.send(event, payload).catch((error: unknown) => {
      if (onError) {
        onError(error)
      } else {
        console.error(`[coreBoxTransport] Failed to send ${event}:`, error)
      }
    })
  })

  return {
    dispatch(payload: TPayload) {
      emit(payload)
    }
  }
}
