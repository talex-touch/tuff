import { useDebounceFn } from '@vueuse/core'

interface ChannelLike {
  send: (event: string, payload?: any) => Promise<any>
}

interface TransportOptions {
  event: string
  debounceMs?: number
  onError?: (error: unknown) => void
}

export interface CoreBoxTransport<TPayload> {
  dispatch: (payload: TPayload) => void
}

export function createCoreBoxTransport<TPayload>(
  channel: ChannelLike,
  options: TransportOptions
): CoreBoxTransport<TPayload> {
  const { event, debounceMs, onError } = options

  // lazy import to keep core util free of vue at call sites
  const maybeDebounce = <T extends (...args: any[]) => void>(fn: T): T => {
    if (!debounceMs) return fn
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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
