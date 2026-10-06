import type {
  LocalAiCliApprovalDecision,
  LocalAiCliLocateRequest,
  LocalAiCliPasteBackRequest,
  LocalAiCliPasteBackResult,
  LocalAiCliProviderStatus,
  LocalAiCliSessionChanged,
  LocalAiCliSessionDiscoveryResult,
  LocalAiCliSessionSummary,
  LocalAiCliStartRequest,
  LocalAiCliStatus,
  LocalAiCliStatusRequest,
  LocalAiCliTaskChunk,
  LocalAiCliTerminalCreateRequest,
  LocalAiCliTerminalCreateResult,
  LocalAiCliTerminalData,
  LocalAiCliTerminalExit,
  LocalAiCliTerminalKillRequest,
  LocalAiCliTerminalResizeRequest,
  LocalAiCliTerminalWriteRequest,
} from '../../events/local-ai-cli'
import type { ITuffTransport, StreamController, StreamOptions } from '../../types'
import { LocalAiCliEvents } from '../../events/local-ai-cli'
import { createTerminalCreationToken, terminalCreationAbortError } from './terminal-creation'

export interface LocalAiCliTerminalCreateOptions {
  signal?: AbortSignal
}

export interface LocalAiCliSdk {
  getStatus: (request?: LocalAiCliStatusRequest) => Promise<LocalAiCliStatus>
  locate: (request: LocalAiCliLocateRequest) => Promise<LocalAiCliProviderStatus>
  openSettings: () => Promise<boolean>
  returnToPanel: () => Promise<boolean>
  streamTask: (
    request: LocalAiCliStartRequest,
    options: StreamOptions<LocalAiCliTaskChunk>,
  ) => Promise<StreamController>
  resolveApproval: (decision: LocalAiCliApprovalDecision) => Promise<void>
  pasteBack: (request: LocalAiCliPasteBackRequest) => Promise<LocalAiCliPasteBackResult>
  session: {
    list: (projectId?: string | null) => Promise<LocalAiCliSessionSummary[]>
    discover: (projectId: string) => Promise<LocalAiCliSessionDiscoveryResult>
    forget: (sessionRef: string) => Promise<{ forgotten: boolean }>
    onChanged: (listener: (payload: LocalAiCliSessionChanged) => void) => () => void
  }
  terminal: {
    create: (request: LocalAiCliTerminalCreateRequest, options?: LocalAiCliTerminalCreateOptions) => Promise<LocalAiCliTerminalCreateResult>
    write: (request: LocalAiCliTerminalWriteRequest) => Promise<void>
    resize: (request: LocalAiCliTerminalResizeRequest) => Promise<void>
    kill: (request: LocalAiCliTerminalKillRequest) => Promise<void>
    onData: (listener: (payload: LocalAiCliTerminalData) => void) => () => void
    onExit: (listener: (payload: LocalAiCliTerminalExit) => void) => () => void
  }
}

export function createLocalAiCliSdk(transport: ITuffTransport): LocalAiCliSdk {
  const createTerminal = (
    request: LocalAiCliTerminalCreateRequest,
    options: LocalAiCliTerminalCreateOptions = {},
  ): Promise<LocalAiCliTerminalCreateResult> => {
    const { promise, resolve, reject } = Promise.withResolvers<LocalAiCliTerminalCreateResult>()
    const { signal } = options
    if (signal?.aborted) {
      reject(terminalCreationAbortError())
      return promise
    }
    const creationToken = createTerminalCreationToken()
    const earlyExits = new Set<string>()
    let sessionId: string | undefined
    let requested = false
    let cancelled = false
    let removeExit: (() => void) | undefined
    let cancelPromise: Promise<void> | undefined
    const cleanup = (): void => {
      removeExit?.()
      removeExit = undefined
      signal?.removeEventListener('abort', abort)
      earlyExits.clear()
    }
    const cancel = (): Promise<void> => {
      if (cancelPromise) return cancelPromise
      try {
        cancelPromise = transport.send(LocalAiCliEvents.terminal.kill, { creationToken }, { immediate: true })
      }
      catch (error) {
        cancelPromise = Promise.reject(error)
      }
      return cancelPromise
    }
    const rejectAfterCancel = (error: unknown): void => {
      void cancel().then(() => reject(error), cleanupError => reject(new AggregateError(
        [error, cleanupError], 'Terminal creation failed and cleanup could not be confirmed', { cause: cleanupError },
      )))
    }
    const abort = (): void => {
      cancelled = true
      cleanup()
      if (requested) rejectAfterCancel(terminalCreationAbortError())
      else reject(terminalCreationAbortError())
    }
    try {
      // Private lifecycle observation does not replace the panel's business output subscriptions.
      removeExit = transport.on(LocalAiCliEvents.terminal.exit, exit => {
        if (sessionId === undefined) earlyExits.add(exit.sessionId)
        else if (exit.sessionId === sessionId) cleanup()
      })
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) {
        abort()
        return promise
      }
      requested = true
      const created = transport.send(LocalAiCliEvents.terminal.create, { ...request, creationToken }, { immediate: true })
      void created.then(result => {
        sessionId = result.sessionId
        if (cancelled) {
          void cancel().catch(() => {})
          return
        }
        if (earlyExits.has(sessionId)) cleanup()
        else earlyExits.clear()
        resolve(result)
      }, error => {
        cancelled = true
        cleanup()
        rejectAfterCancel(error)
      })
    }
    catch (error) {
      cancelled = true
      cleanup()
      if (requested) rejectAfterCancel(error)
      else reject(error)
    }
    return promise
  }
  return {
    getStatus: request => transport.send(LocalAiCliEvents.status.get, request),
    locate: request => transport.send(LocalAiCliEvents.status.locate, request),
    openSettings: () => transport.send(LocalAiCliEvents.status.openSettings),
    returnToPanel: () => transport.send(LocalAiCliEvents.status.returnToPanel),
    streamTask: (request, options) => transport.stream(LocalAiCliEvents.task.stream, request, options),
    resolveApproval: decision => transport.send(LocalAiCliEvents.task.approval, decision),
    pasteBack: request => transport.send(LocalAiCliEvents.task.pasteBack, request),
    session: {
      list: projectId =>
        transport.send(
          LocalAiCliEvents.session.list,
          projectId === undefined ? undefined : { projectId },
        ),
      discover: projectId => transport.send(LocalAiCliEvents.session.discover, { projectId }),
      forget: sessionRef => transport.send(LocalAiCliEvents.session.forget, { sessionRef }),
      onChanged: listener => transport.on(LocalAiCliEvents.session.changed, listener),
    },
    terminal: {
      create: createTerminal,
      write: request => transport.send(LocalAiCliEvents.terminal.write, request),
      resize: request => transport.send(LocalAiCliEvents.terminal.resize, request),
      kill: request => transport.send(LocalAiCliEvents.terminal.kill, request),
      onData: listener => transport.on(LocalAiCliEvents.terminal.data, listener),
      onExit: listener => transport.on(LocalAiCliEvents.terminal.exit, listener),
    },
  }
}
