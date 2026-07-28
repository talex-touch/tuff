export const PLUGIN_HOST_CONTROL_PORT_HANDOFF = 'tuff:plugin-host-control-port:v2' as const

export interface PluginHostControlPortLike {}

export interface PluginHostControlPort extends PluginHostControlPortLike {
  postMessage(message: unknown): void
  on(event: 'message' | 'close', listener: (...args: unknown[]) => void): void
  off(event: 'message' | 'close', listener: (...args: unknown[]) => void): void
  start(): void
  close(): void
}

interface PluginHostControlPortHandoff {
  readonly data: unknown
  readonly ports?: unknown
}

function snapshotTransferredPorts(value: unknown): unknown[] {
  let transferred: unknown
  try {
    if (!value || typeof value !== 'object') return []
    transferred = (value as PluginHostControlPortHandoff).ports
  } catch {
    return []
  }
  if (!Array.isArray(transferred)) return []

  let length: number
  try {
    length = transferred.length
  } catch {
    return []
  }
  const ports: unknown[] = []
  for (let index = 0; index < length; index += 1) {
    try {
      ports.push(transferred[index])
    } catch {
      ports.push(undefined)
    }
  }
  return ports
}

function closeTransferredPort(value: unknown): void {
  try {
    if (!value || typeof value !== 'object') return
    const close = (value as { close?: unknown }).close
    if (typeof close === 'function') close.call(value)
  } catch {
    // Invalid transferred ports must not prevent cleanup of their siblings.
  }
}

function isControlPort(value: unknown): value is PluginHostControlPort {
  try {
    if (!value || typeof value !== 'object') return false
    const port = value as PluginHostControlPort
    return (
      typeof port.postMessage === 'function' &&
      typeof port.on === 'function' &&
      typeof port.off === 'function' &&
      typeof port.start === 'function' &&
      typeof port.close === 'function'
    )
  } catch {
    return false
  }
}

export function takePluginHostControlPort(
  event: PluginHostControlPortHandoff
): PluginHostControlPort | null {
  const ports = snapshotTransferredPorts(event)
  let marker: unknown
  try {
    marker = event?.data
  } catch {
    marker = undefined
  }
  const valid =
    marker === PLUGIN_HOST_CONTROL_PORT_HANDOFF && ports.length === 1 && isControlPort(ports[0])
  if (valid) return ports[0] as PluginHostControlPort
  for (const port of ports) closeTransferredPort(port)
  return null
}
