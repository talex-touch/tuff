import type {
  LocalAiCliApprovalDecision,
  LocalAiCliLocateRequest,
  LocalAiCliPasteBackRequest,
  LocalAiCliPasteBackResult,
  LocalAiCliProviderStatus,
  LocalAiCliStartRequest,
  LocalAiCliStatus,
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

export interface LocalAiCliSdk {
  getStatus: () => Promise<LocalAiCliStatus>
  locate: (request: LocalAiCliLocateRequest) => Promise<LocalAiCliProviderStatus>
  openSettings: () => Promise<boolean>
  returnToPanel: () => Promise<boolean>
  streamTask: (
    request: LocalAiCliStartRequest,
    options: StreamOptions<LocalAiCliTaskChunk>,
  ) => Promise<StreamController>
  resolveApproval: (decision: LocalAiCliApprovalDecision) => Promise<void>
  pasteBack: (request: LocalAiCliPasteBackRequest) => Promise<LocalAiCliPasteBackResult>
  terminal: {
    create: (request: LocalAiCliTerminalCreateRequest) => Promise<LocalAiCliTerminalCreateResult>
    write: (request: LocalAiCliTerminalWriteRequest) => Promise<void>
    resize: (request: LocalAiCliTerminalResizeRequest) => Promise<void>
    kill: (request: LocalAiCliTerminalKillRequest) => Promise<void>
    onData: (listener: (payload: LocalAiCliTerminalData) => void) => () => void
    onExit: (listener: (payload: LocalAiCliTerminalExit) => void) => () => void
  }
}

export function createLocalAiCliSdk(transport: ITuffTransport): LocalAiCliSdk {
  return {
    getStatus: () => transport.send(LocalAiCliEvents.status.get),
    locate: request => transport.send(LocalAiCliEvents.status.locate, request),
    openSettings: () => transport.send(LocalAiCliEvents.status.openSettings),
    returnToPanel: () => transport.send(LocalAiCliEvents.status.returnToPanel),
    streamTask: (request, options) => transport.stream(LocalAiCliEvents.task.stream, request, options),
    resolveApproval: decision => transport.send(LocalAiCliEvents.task.approval, decision),
    pasteBack: request => transport.send(LocalAiCliEvents.task.pasteBack, request),
    terminal: {
      create: request => transport.send(LocalAiCliEvents.terminal.create, request),
      write: request => transport.send(LocalAiCliEvents.terminal.write, request),
      resize: request => transport.send(LocalAiCliEvents.terminal.resize, request),
      kill: request => transport.send(LocalAiCliEvents.terminal.kill, request),
      onData: listener => transport.on(LocalAiCliEvents.terminal.data, listener),
      onExit: listener => transport.on(LocalAiCliEvents.terminal.exit, listener),
    },
  }
}
