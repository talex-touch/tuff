import type { LocalAiCliProviderId } from '@talex-touch/utils/transport/events/local-ai-cli'

export interface NativeSessionLeaseKey {
  provider: LocalAiCliProviderId
  projectRoot: string
  nativeSessionId: string
}

function leaseKey(value: NativeSessionLeaseKey): string {
  return JSON.stringify([value.provider, value.projectRoot, value.nativeSessionId])
}

export class NativeSessionLeaseRegistry {
  private readonly active = new Set<string>()

  acquire(value: NativeSessionLeaseKey): () => void {
    const key = leaseKey(value)
    if (this.active.has(key)) throw new Error('NATIVE_SESSION_BUSY')
    this.active.add(key)
    let released = false
    return () => {
      if (released) return
      released = true
      this.active.delete(key)
    }
  }

  isLeased(value: NativeSessionLeaseKey): boolean {
    return this.active.has(leaseKey(value))
  }

  clear(): void {
    this.active.clear()
  }
}

export const nativeSessionLeaseRegistry = new NativeSessionLeaseRegistry()
