import type {
  PlatformCapability,
  PlatformCapabilityScope,
  PlatformCapabilityStatus
} from '@talex-touch/utils'

interface CapabilityQuery {
  scope?: PlatformCapabilityScope
  status?: PlatformCapabilityStatus
}

class PlatformCapabilityRegistry {
  private capabilities = new Map<string, PlatformCapability>()

  register(capability: PlatformCapability): void {
    this.capabilities.set(capability.id, capability)
  }

  list(query: CapabilityQuery = {}): PlatformCapability[] {
    const items = Array.from(this.capabilities.values())
    return items.filter((item) => {
      if (query.scope && item.scope !== query.scope) return false
      if (query.status && item.status !== query.status) return false
      return true
    })
  }
}

const registry = new PlatformCapabilityRegistry()
let defaultsRegistered = false

/**
 * The text here is English. `localizePlatformCapability` (capability-text.ts) words a capability in
 * the interface language when the list is built, so a new capability needs an entry there too.
 */
export function registerDefaultPlatformCapabilities(): void {
  if (defaultsRegistered) return
  defaultsRegistered = true

  registry.register({
    id: 'platform.permission-center',
    name: 'Permission Center',
    description: 'Plugin permission requests, grants and auditing',
    scope: 'system',
    status: 'stable',
    supportLevel: 'supported',
    sensitive: true
  })

  registry.register({
    id: 'platform.storage',
    name: 'Storage',
    description: 'Configuration and persistent storage',
    scope: 'system',
    status: 'stable',
    supportLevel: 'supported'
  })

  registry.register({
    id: 'platform.download-center',
    name: 'Download Center',
    description: 'Download tasks and their notifications, in one place',
    scope: 'system',
    status: 'stable',
    supportLevel: 'supported'
  })

  registry.register({
    id: 'platform.temp-file',
    name: 'TempFile',
    description: 'Creating and cleaning up temporary files',
    scope: 'system',
    status: 'beta',
    supportLevel: 'supported'
  })

  registry.register({
    id: 'platform.flow-transfer',
    name: 'Flow Transfer',
    description: 'Passing data between plugins',
    scope: 'plugin',
    status: 'beta',
    supportLevel: 'best_effort',
    issueCode: 'TARGET_HANDLER_REQUIRED',
    reason: 'Flow Transfer requires the target plugin to register a delivery handler.',
    limitations: [
      'Targets without a registered Flow handler are rejected instead of treated as delivered.'
    ],
    sensitive: true
  })

  registry.register({
    id: 'platform.division-box',
    name: 'DivisionBox',
    description: 'Floating windows and UI containers for plugins',
    scope: 'plugin',
    status: 'beta',
    supportLevel: 'supported'
  })

  registry.register({
    id: 'platform.intelligence-agents',
    name: 'Intelligence Agents',
    description: 'Running agent tasks and their tool calls',
    scope: 'ai',
    status: 'beta',
    supportLevel: 'supported'
  })
}

export const platformCapabilityRegistry = registry
