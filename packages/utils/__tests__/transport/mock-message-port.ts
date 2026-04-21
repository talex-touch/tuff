type PortEventType = 'message' | 'close' | 'messageerror'
type PortListener = (event?: any) => void

export class MockMessagePort {
  onmessage: PortListener | null = null
  private readonly listeners = new Map<PortEventType, Set<PortListener>>([
    ['message', new Set()],
    ['close', new Set()],
    ['messageerror', new Set()],
  ])
  private closed = false

  addEventListener(type: PortEventType, listener: PortListener): void {
    this.listeners.get(type)?.add(listener)
  }

  removeEventListener(type: PortEventType, listener: PortListener): void {
    this.listeners.get(type)?.delete(listener)
  }

  start(): void {}

  close(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    this.emit('close')
  }

  dispatchMessage(data: unknown): void {
    const event = { data }
    this.onmessage?.(event)
    this.emit('message', event)
  }

  dispatchMessageError(): void {
    this.emit('messageerror')
  }

  private emit(type: PortEventType, event?: any): void {
    this.listeners.get(type)?.forEach(listener => listener(event))
  }
}
