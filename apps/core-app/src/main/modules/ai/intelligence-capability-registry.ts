import type {
  IntelligenceCapabilityDescriptor,
  IntelligenceCapabilityType
} from '@talex-touch/tuff-intelligence'
import { createLogger } from '../../utils/logger'

const capabilityRegistryLog = createLogger('Intelligence').child('CapabilityRegistry')

export class TuffIntelligenceCapabilityRegistry {
  private capabilities = new Map<string, IntelligenceCapabilityDescriptor>()

  register(capability: IntelligenceCapabilityDescriptor): void {
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

  get(capabilityId: string): IntelligenceCapabilityDescriptor | undefined {
    return this.capabilities.get(capabilityId)
  }

  getByType(type: IntelligenceCapabilityType): IntelligenceCapabilityDescriptor[] {
    return Array.from(this.capabilities.values()).filter((cap) => cap.type === type)
  }

  getAll(): IntelligenceCapabilityDescriptor[] {
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

export const intelligenceCapabilityRegistry = new TuffIntelligenceCapabilityRegistry()
