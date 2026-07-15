/**
 * Plugin host process — utilityProcess entry (C1-B stage 1 skeleton).
 *
 * Runs isolated from the main process so a future Prelude `vm` escape can only
 * reach this child, never the main process. Stage 1 only establishes the control
 * MessagePort and answers ping/pong to prove connectivity; Prelude execution
 * (stage 2) and the SDK bridge (stage 3) land later.
 */
import type { MessagePortMain } from 'electron'

interface ControlMessage {
  type: string
  id?: number
  payload?: unknown
}

interface ParentPortLike {
  once: (
    event: 'message',
    listener: (e: { data: unknown; ports: MessagePortMain[] }) => void
  ) => void
}

const parentPort = (process as unknown as { parentPort?: ParentPortLike }).parentPort

parentPort?.once('message', (event) => {
  const controlPort = event.ports?.[0]
  if (!controlPort) {
    return
  }

  controlPort.on('message', (message: { data: unknown }) => {
    const data = message.data as ControlMessage
    switch (data?.type) {
      case 'ping':
        controlPort.postMessage({ type: 'pong', id: data.id })
        break
      default:
        controlPort.postMessage({
          type: 'error',
          id: data?.id,
          payload: `unknown message: ${String(data?.type)}`
        })
    }
  })
  controlPort.start()

  // Announce readiness once the control channel is wired.
  controlPort.postMessage({ type: 'ready' })
})
