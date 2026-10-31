import { defineEvent } from '../event/builder'

export interface TerminalCreateRequest {
  command?: string
  args?: string[]
  cwd?: string
  cols?: number
  rows?: number
  /** SDK-issued cancellation correlation. Never an owner or authorization proof. */
  creationToken?: string
  /**
   * Asks the host to pause the process while too much of its output awaits `session.ack`.
   * Set by the SDK, which acknowledges every data payload.
   */
  flowControl?: boolean
}

export interface TerminalCreateResponse {
  id: string
  /** Confirms `flowControl`; hosts that predate it omit this and expect no `ack`. */
  flowControl?: boolean
}

export interface TerminalWriteRequest {
  id: string
  data: string
}

export interface TerminalResizeRequest {
  id: string
  cols: number
  rows: number
}

export type TerminalCloseRequest =
  | { id: string, creationToken?: never }
  | { creationToken: string, id?: never }

export interface TerminalDataPayload {
  id: string
  data: string
}

export interface TerminalAckRequest {
  id: string
  /** Length of a data payload that has been displayed. */
  chars: number
}

export interface TerminalExitPayload {
  id: string
  exitCode: number | null
  signal?: number
}
export interface TerminalFontInfo {
  family: string
  label: string
  isNerdFont: boolean
}

export interface TerminalFontsResponse {
  fonts: TerminalFontInfo[]
}

export const TerminalEvents = {
  session: {
    create: defineEvent('terminal').module('session').event('create')
      .define<TerminalCreateRequest, TerminalCreateResponse>(),
    write: defineEvent('terminal').module('session').event('write')
      .define<TerminalWriteRequest, void>(),
    resize: defineEvent('terminal').module('session').event('resize')
      .define<TerminalResizeRequest, void>(),
    close: defineEvent('terminal').module('session').event('close')
      .define<TerminalCloseRequest, void>(),
    data: defineEvent('terminal').module('session').event('data')
      .define<TerminalDataPayload, void>(),
    ack: defineEvent('terminal').module('session').event('ack')
      .define<TerminalAckRequest, void>(),
    exit: defineEvent('terminal').module('session').event('exit')
      .define<TerminalExitPayload, void>(),
  },
  fonts: {
    list: defineEvent('terminal').module('fonts').event('list')
      .define<void, TerminalFontsResponse>(),
  },
} as const
