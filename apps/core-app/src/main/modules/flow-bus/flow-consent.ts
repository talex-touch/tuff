import type { FlowTargetInfo } from '@talex-touch/utils'
import { storageModule } from '../storage'

const FLOW_CONSENT_KEY = 'flow-consent.json'
const FLOW_ONCE_TOKEN_TTL_MS = 5 * 60 * 1000

type FlowConsentSnapshot = Record<string, string[]>

class FlowConsentStore {
  private loaded = false
  private data = new Map<string, Set<string>>()
  private onceTokens = new Map<string, { token: string; expiresAt: number }>()

  load(): void {
    if (this.loaded) {
      return
    }
    if (!storageModule.filePath) {
      return
    }
    const raw = storageModule.getConfig(FLOW_CONSENT_KEY) as FlowConsentSnapshot | undefined
    if (raw && typeof raw === 'object') {
      Object.entries(raw).forEach(([senderId, targets]) => {
        if (!Array.isArray(targets)) {
          return
        }
        const set = new Set(targets.filter((id) => typeof id === 'string' && id.length > 0))
        if (set.size > 0) {
          this.data.set(senderId, set)
        }
      })
    }
    this.loaded = true
  }

  hasConsent(senderId: string, targetId: string): boolean {
    this.ensureLoaded()
    return this.data.get(senderId)?.has(targetId) ?? false
  }

  grantOnce(senderId: string, targetId: string): string {
    this.ensureLoaded()
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const key = this.buildKey(senderId, targetId)
    this.onceTokens.set(key, {
      token,
      expiresAt: Date.now() + FLOW_ONCE_TOKEN_TTL_MS
    })
    return token
  }

  consumeOnce(senderId: string, targetId: string, token: string): boolean {
    if (!token) {
      return false
    }
    const key = this.buildKey(senderId, targetId)
    const entry = this.onceTokens.get(key)
    if (!entry) {
      return false
    }
    if (entry.expiresAt < Date.now()) {
      this.onceTokens.delete(key)
      return false
    }
    if (entry.token !== token) {
      return false
    }
    this.onceTokens.delete(key)
    return true
  }

  grantConsent(senderId: string, targetId: string): void {
    this.ensureLoaded()
    if (!senderId || !targetId) {
      return
    }
    const set = this.data.get(senderId) ?? new Set<string>()
    if (!this.data.has(senderId)) {
      this.data.set(senderId, set)
    }
    if (!set.has(targetId)) {
      set.add(targetId)
      this.persist()
    }
  }

  private ensureLoaded(): void {
    if (!this.loaded) {
      this.load()
    }
  }

  private buildKey(senderId: string, targetId: string): string {
    return `${senderId}::${targetId}`
  }

  private persist(): void {
    if (!storageModule.filePath) {
      return
    }
    const snapshot: FlowConsentSnapshot = {}
    for (const [senderId, targets] of this.data) {
      snapshot[senderId] = Array.from(targets)
    }
    storageModule.saveConfig(FLOW_CONSENT_KEY, snapshot)
  }
}

export const flowConsentStore = new FlowConsentStore()

export function requiresFlowConsent(
  senderId: string,
  targetInfo: FlowTargetInfo | null | undefined
): boolean {
  if (!senderId || !targetInfo) {
    return false
  }
  if (targetInfo.isNativeShare) {
    return false
  }
  if (senderId === targetInfo.pluginId) {
    return false
  }
  return true
}
