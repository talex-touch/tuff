import { defineEvent } from '../event/builder'

export interface TerminalCreateRequest {
  command: string
  args?: string[]
  cwd?: string
  cols?: number
  rows?: number
  /** SDK-issued cancellation correlation. Never an owner or authorization proof. */
  creationToken?: string
}

export interface TerminalCreateResponse {
  id: string
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

export interface TerminalExitPayload {
  id: string
  exitCode: number | null
  signal?: number
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
    exit: defineEvent('terminal').module('session').event('exit')
      .define<TerminalExitPayload, void>(),
  },
} as const
