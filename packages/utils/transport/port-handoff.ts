import type { TransportPortConfirmPayload, TransportPortScope } from './events'
import { hasWindow } from '../env'
import { TransportEvents } from './events'

export const TRANSPORT_PORT_HANDOFF_MARKER = 'talex-touch:transport-port-handoff:v1'

type TransportPortHandoffWindow = Pick<
  Window,
  'addEventListener' | 'postMessage' | 'removeEventListener'
>

interface TransportPortTransferEvent {
  ports?: readonly MessagePort[]
}

export interface TransportPortHandoffIpcRenderer {
  on: (channel: string, listener: (event: any, ...args: any[]) => void) => unknown
  removeListener: (channel: string, listener: (event: any, ...args: any[]) => void) => unknown
}

export interface TransportPortHandoffMessage {
  marker: typeof TRANSPORT_PORT_HANDOFF_MARKER
  payload: TransportPortConfirmPayload
}

export type TransportPortHandoffListener = (
  port: MessagePort,
  payload: TransportPortConfirmPayload,
) => void

const TRANSPORT_PORT_SCOPES = new Set<TransportPortScope>(['app', 'window', 'plugin'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

export function isTransportPortConfirmPayload(
  value: unknown,
): value is TransportPortConfirmPayload {
  if (!isRecord(value)) {
    return false
  }

  if (
    typeof value.channel !== 'string'
    || value.channel.trim().length === 0
    || typeof value.portId !== 'string'
    || value.portId.trim().length === 0
  ) {
    return false
  }

  if (
    value.scope !== undefined
    && (typeof value.scope !== 'string'
      || !TRANSPORT_PORT_SCOPES.has(value.scope as TransportPortScope))
  ) {
    return false
  }

  return value.permissions === undefined || isStringArray(value.permissions)
}

export function isTransportPortHandoffMessage(
  value: unknown,
): value is TransportPortHandoffMessage {
  return isRecord(value)
    && value.marker === TRANSPORT_PORT_HANDOFF_MARKER
    && isTransportPortConfirmPayload(value.payload)
}

function closeTransferredPorts(ports: readonly MessagePort[] | undefined): void {
  if (!ports) {
    return
  }

  for (const port of ports) {
    try {
      port.close()
    }
    catch {}
  }
}

function resolveWindow(): Window | null {
  return hasWindow() ? window : null
}

export function installTransportPortHandoff(
  ipcRenderer: TransportPortHandoffIpcRenderer,
  targetWindow: TransportPortHandoffWindow | null = resolveWindow(),
): () => void {
  if (!targetWindow) {
    return () => {}
  }

  const eventName = TransportEvents.port.confirm.toEventName()
  const handler = (event: TransportPortTransferEvent, payload: unknown): void => {
    const ports = event?.ports
    if (!isTransportPortConfirmPayload(payload) || ports?.length !== 1) {
      closeTransferredPorts(ports)
      return
    }

    const port = ports[0]
    try {
      targetWindow.postMessage(
        { marker: TRANSPORT_PORT_HANDOFF_MARKER, payload } satisfies TransportPortHandoffMessage,
        '*',
        [port],
      )
    }
    catch {
      try {
        port.close()
      }
      catch {}
    }
  }

  ipcRenderer.on(eventName, handler)
  return () => {
    ipcRenderer.removeListener(eventName, handler)
  }
}

export function subscribeTransportPortHandoff(
  listener: TransportPortHandoffListener,
  targetWindow: TransportPortHandoffWindow | null = resolveWindow(),
): (() => void) | null {
  if (!targetWindow) {
    return null
  }

  const handler = (event: MessageEvent): void => {
    if (event.source !== targetWindow || !isRecord(event.data)) {
      return
    }

    if (event.data.marker !== TRANSPORT_PORT_HANDOFF_MARKER) {
      return
    }

    if (!isTransportPortHandoffMessage(event.data) || event.ports.length !== 1) {
      closeTransferredPorts(event.ports)
      return
    }

    listener(event.ports[0], event.data.payload)
  }

  targetWindow.addEventListener('message', handler)
  return () => {
    targetWindow.removeEventListener('message', handler)
  }
}
