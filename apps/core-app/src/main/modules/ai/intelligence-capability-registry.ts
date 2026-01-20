import type { AiCapabilityDescriptor, IntelligenceCapabilityType } from '@talex-touch/utils'
import { createLogger } from '../../utils/logger'

const capabilityRegistryLog = createLogger('Intelligence').child('CapabilityRegistry')

export class AiCapabilityRegistry {
  private capabilities = new Map<string, AiCapabilityDescriptor>()

  register(capability: AiCapabilityDescriptor): void {
    if (this.capabilities.has(capability.id)) {
      capabilityRegistryLog.warn(`Capability ${capability.id} already registered, overwriting`)
    }
    this.capabilities.set(capability.id, capability)
    capabilityRegistryLog.debug(`Registered capability: ${capability.id}`)
  }

  unregister(capabilityId: string): void {
    if (this.capabilities.delete(capabilityId)) {
      capabilityRegistryLog.debug(`Unregistered capability: ${capabilityId}`)
    } else {
      capabilityRegistryLog.warn(`Capability ${capabilityId} not found`)
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
    capabilityRegistryLog.info('Cleared all capabilities')
  }

  size(): number {
    return this.capabilities.size
  }
}

export const aiCapabilityRegistry = new AiCapabilityRegistry()
