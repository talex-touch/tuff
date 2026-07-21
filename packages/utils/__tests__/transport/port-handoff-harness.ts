import { MessageChannel, MessagePort } from 'node:worker_threads'

type IpcListener = (event: { ports?: readonly MessagePort[] }, payload: unknown) => void
interface WindowMessage {
  data: unknown
  ports: readonly MessagePort[]
  source: unknown
}
type WindowListener = (event: WindowMessage) => void
type NativeTransferList = NonNullable<Parameters<MessagePort['postMessage']>[1]>

interface PortHandoffHarnessOptions {
  throwOnPostMessage?: boolean
}

export interface PortHandoffHarness {
  ipcRenderer: {
    on: (channel: string, listener: IpcListener) => void
    removeListener: (channel: string, listener: IpcListener) => void
  }
  targetWindow: Pick<Window, 'addEventListener' | 'postMessage' | 'removeEventListener'>
  postedMessages: unknown[]
  emit: (channel: string, payload: unknown, ports?: readonly MessagePort[]) => void
  dispatchFrom: (source: unknown, data: unknown, ports?: readonly MessagePort[]) => void
  dispose: () => void
}

/**
 * Bridges the test harness's native Node MessagePort to Window.postMessage's
 * DOM declaration. Both APIs use the structured-clone transfer list at runtime.
 */
export function toWindowTransferable(port: MessagePort): Transferable {
  const windowTransferable = port as unknown as Transferable
  return windowTransferable
}

/**
 * Models Electron's isolated-world event and the same-window structured-clone
 * handoff. Ports always cross the boundary through MessagePort.postMessage.
 */
export function createPortHandoffHarness(
  options: PortHandoffHarnessOptions = {},
): PortHandoffHarness {
  const ipcListeners = new Map<string, IpcListener>()
  const windowListeners = new Map<unknown, WindowListener>()
  const postedMessages: unknown[] = []
  const delivery = new MessageChannel()

  const targetWindowImplementation = {
    addEventListener(type: string, listener: unknown): void {
      if (type === 'message' && typeof listener === 'function') {
        const windowListener = (event: WindowMessage) => listener(event)
        windowListeners.set(listener, windowListener)
      }
    },
    removeEventListener(type: string, listener: unknown): void {
      if (type === 'message') {
        windowListeners.delete(listener)
      }
    },
    postMessage(data: unknown, _targetOrigin: string, transfer: readonly unknown[] = []): void {
      if (options.throwOnPostMessage) {
        throw new Error('window delivery unavailable')
      }
      postedMessages.push(data)
      const nativeTransferList = transfer as NativeTransferList
      delivery.port1.postMessage(data, nativeTransferList)
    },
  }
  const targetWindow = targetWindowImplementation as unknown as Pick<
    Window,
    'addEventListener' | 'postMessage' | 'removeEventListener'
  >

  delivery.port2.addEventListener('message', (event: Event) => {
    if (!('data' in event) || !('ports' in event) || !Array.isArray(event.ports)) {
      return
    }
    const transferredMessage: WindowMessage = {
      data: event.data,
      ports: event.ports.filter((port): port is MessagePort => port instanceof MessagePort),
      source: targetWindow,
    }
    windowListeners.forEach(listener => listener(transferredMessage))
  })
  delivery.port2.start()

  return {
    ipcRenderer: {
      on(channel, listener) {
        ipcListeners.set(channel, listener)
      },
      removeListener(channel, listener) {
        if (ipcListeners.get(channel) === listener) {
          ipcListeners.delete(channel)
        }
      },
    },
    targetWindow,
    postedMessages,
    emit(channel, payload, ports) {
      ipcListeners.get(channel)?.({ ports }, payload)
    },
    dispatchFrom(source, data, ports = []) {
      const message: WindowMessage = { data, ports, source }
      windowListeners.forEach(listener => listener(message))
    },
    dispose() {
      ipcListeners.clear()
      windowListeners.clear()
      delivery.port1.close()
      delivery.port2.close()
    },
  }
}

export function createNativePortPair(): {
  receiver: MessagePort
  sender: MessagePort
} {
  const channel = new MessageChannel()
  channel.port1.start()
  channel.port2.start()
  return { receiver: channel.port1, sender: channel.port2 }
}

export function waitForPortClose(port: MessagePort): Promise<void> {
  return new Promise((resolve) => {
    port.addEventListener('close', () => resolve(), { once: true })
    port.start()
  })
}
