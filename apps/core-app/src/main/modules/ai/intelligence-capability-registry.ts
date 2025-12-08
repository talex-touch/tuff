import type { AiCapabilityDescriptor, IntelligenceCapabilityType } from '@talex-touch/utils'

export class AiCapabilityRegistry {
  private capabilities = new Map<string, AiCapabilityDescriptor>()

  register(capability: AiCapabilityDescriptor): void {
    if (this.capabilities.has(capability.id)) {
      console.warn(
        `[AiCapabilityRegistry] Capability ${capability.id} already registered, overwriting`
      )
    }
    this.capabilities.set(capability.id, capability)
    console.debug(`[AiCapabilityRegistry] Registered capability: ${capability.id}`)
  }

  unregister(capabilityId: string): void {
    if (this.capabilities.delete(capabilityId)) {
      console.debug(`[AiCapabilityRegistry] Unregistered capability: ${capabilityId}`)
    } else {
      console.warn(`[AiCapabilityRegistry] Capability ${capabilityId} not found`)
    }
  }

  get(capabilityId: string): AiCapabilityDescriptor | undefined {
    return this.capabilities.get(capabilityId)
  }

  getByType(type: IntelligenceCapabilityType): AiCapabilityDescriptor[] {
    return Array.from(this.capabilities.values()).filter((cap) => cap.type === type)
  }

  getAll(): AiCapabilityDescriptor[] {
    return Array.from(this.capabilities.values())
  }

  has(capabilityId: string): boolean {
    return this.capabilities.has(capabilityId)
  }

  clear(): void {
    this.capabilities.clear()
    console.log('[AiCapabilityRegistry] Cleared all capabilities')
  }

  size(): number {
    return this.capabilities.size
  }
}

export const aiCapabilityRegistry = new AiCapabilityRegistry()
