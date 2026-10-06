import type {
  TerminalCreateRequest, TerminalDataPayload, TerminalExitPayload,
} from '../../events/terminal'
import type { ITuffTransport } from '../../types'
import { TerminalEvents } from '../../events/terminal'
import { createTerminalCreationToken, terminalCreationAbortError } from './terminal-creation'

export interface TerminalSessionHandlers {
  onData?: (data: string) => void
  onExit?: (exit: TerminalExitPayload) => void
  signal?: AbortSignal
}

export interface TerminalSessionHandle {
  readonly id: string
  write: (data: string) => Promise<void>
  resize: (cols: number, rows: number) => Promise<void>
  close: () => Promise<void>
}

export interface TerminalSdk {
  create: (
    request: TerminalCreateRequest,
    handlers?: TerminalSessionHandlers,
  ) => Promise<TerminalSessionHandle>
}

type EarlyEvent = { type: 'data', payload: TerminalDataPayload }
  | { type: 'exit', payload: TerminalExitPayload }


export function createTerminalSdk(transport: ITuffTransport): TerminalSdk {
  return {
    create(request, handlers = {}) {
      const { promise, resolve, reject } = Promise.withResolvers<TerminalSessionHandle>()
      const { signal } = handlers
      if (signal?.aborted) {
        reject(terminalCreationAbortError())
        return promise
      }
      const creationToken = createTerminalCreationToken()
      let requested = false
      let id: string | undefined
      let closed = false
      let observedExit = false
      let closing = false
      let cancelled = false
      let flushing = false
      let closePromise: Promise<void> | undefined
      const early: EarlyEvent[] = []
      const disposers: (() => void)[] = []
      const cleanup = (): void => {
        for (const dispose of disposers.splice(0)) dispose()
        signal?.removeEventListener('abort', abort)
        early.length = 0
      }
      const close = (byCreationToken = false): Promise<void> => {
        if (closePromise) return closePromise
        if (closed) {
          cleanup()
          closePromise = Promise.resolve()
          return closePromise
        }
        closing = true
        try {
          const target = byCreationToken || id === undefined ? { creationToken } : { id }
          closePromise = transport.send(TerminalEvents.session.close, target, { immediate: true }).catch(error => {
            // A genuine native exit can win this request; only that evidence makes close complete.
            if (!observedExit) throw error
          }).finally(() => {
            closed = true
            cleanup()
          })
        }
        catch (error) {
          closed = true
          cleanup()
          closePromise = Promise.reject(error)
        }
        return closePromise
      }
      const rejectAfterClose = (error: unknown): void => {
        void close(true).then(() => reject(error), cleanupError => reject(new AggregateError(
          [error, cleanupError], 'Terminal creation failed and cleanup could not be confirmed', { cause: cleanupError },
        )))
      }
      const abort = (): void => {
        cancelled = true
        cleanup()
        if (requested) rejectAfterClose(terminalCreationAbortError())
        else reject(terminalCreationAbortError())
      }
      const dispatch = (event: EarlyEvent): void => {
        if (closed || event.payload.id !== id) return
        if (event.type === 'data') handlers.onData?.(event.payload.data)
        else {
          observedExit = true
          closed = true
          cleanup()
          handlers.onExit?.(event.payload)
        }
      }
      const receive = (event: EarlyEvent): void => {
        if (closed || cancelled) return
        if (id === undefined || flushing) early.push(event)
        else {
          try {
            dispatch(event)
          }
          catch (error) {
            cancelled = true
            cleanup()
            void close(true).catch(() => {})
            throw error
          }
        }
      }
      try {
        // Both listeners precede create: the PTY can output and exit before its reply.
        disposers.push(transport.on(TerminalEvents.session.data, payload => {
          receive({ type: 'data', payload })
        }))
        disposers.push(transport.on(TerminalEvents.session.exit, payload => {
          receive({ type: 'exit', payload })
        }))
        signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted) {
          abort()
          return promise
        }
        requested = true
        const created = transport.send(TerminalEvents.session.create, { ...request, creationToken }, { immediate: true })
        void created.then(result => {
          id = result.id
          if (cancelled) {
            // The caller may have stopped awaiting. Reclaim its late session nonetheless.
            void close(true).catch(() => {})
            return
          }
          try {
            flushing = true
            for (const event of early) dispatch(event)
            early.length = 0
            flushing = false
            const sessionId = result.id
            resolve({
              id: sessionId,
              write: data => closed || closing ? Promise.reject(new Error('TERMINAL_SESSION_CLOSED'))
                : transport.send(TerminalEvents.session.write, { id: sessionId, data }, { immediate: true }),
              resize: (cols, rows) => closed || closing ? Promise.reject(new Error('TERMINAL_SESSION_CLOSED'))
                : transport.send(TerminalEvents.session.resize, { id: sessionId, cols, rows }, { immediate: true }),
              close,
            })
          }
          catch (error) {
            flushing = false
            cancelled = true
            cleanup()
            rejectAfterClose(error)
          }
        }, error => {
          cancelled = true
          cleanup()
          rejectAfterClose(error)
        })
      }
      catch (error) {
        cancelled = true
        cleanup()
        if (requested) rejectAfterClose(error)
        else {
          closed = true
          reject(error)
        }
      }
      return promise
    },
  }
}
