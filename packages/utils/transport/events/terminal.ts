import { defineEvent, defineRawEvent } from '../event/builder'

export interface TerminalCreateRequest {
  command: string
  args?: string[]
}

export interface TerminalCreateResponse {
  id: string
}

export interface TerminalWriteRequest {
  id: string
  data: string
}

export interface TerminalKillRequest {
  id: string
}

export interface TerminalDataPayload {
  id: string
  data: string
}

export interface TerminalExitPayload {
  id: string
  exitCode: number | null
}

export const TerminalEvents = {
  session: {
    create: defineEvent('terminal')
      .module('session')
      .event('create')
      .define<TerminalCreateRequest, TerminalCreateResponse>(),
    write: defineEvent('terminal')
      .module('session')
      .event('write')
      .define<TerminalWriteRequest, void>(),
    kill: defineEvent('terminal')
      .module('session')
      .event('kill')
      .define<TerminalKillRequest, void>(),
    data: defineEvent('terminal')
      .module('session')
      .event('data')
      .define<TerminalDataPayload, void>(),
    exit: defineEvent('terminal')
      .module('session')
      .event('exit')
      .define<TerminalExitPayload, void>(),
  },
  legacy: {
    create: defineRawEvent<TerminalCreateRequest, TerminalCreateResponse>('terminal:create'),
    write: defineRawEvent<TerminalWriteRequest, void>('terminal:write'),
    kill: defineRawEvent<TerminalKillRequest, void>('terminal:kill'),
    data: defineRawEvent<TerminalDataPayload, void>('terminal:data'),
    exit: defineRawEvent<TerminalExitPayload, void>('terminal:exit'),
  },
} as const
