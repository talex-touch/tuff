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

export function registerDefaultPlatformCapabilities(): void {
  if (defaultsRegistered) return
  defaultsRegistered = true

  registry.register({
    id: 'platform.permission-center',
    name: 'Permission Center',
    description: '插件权限申请、授权与审计',
    scope: 'system',
    status: 'stable',
    sensitive: true
  })

  registry.register({
    id: 'platform.storage',
    name: 'Storage',
    description: '配置与持久化存储能力',
    scope: 'system',
    status: 'stable'
  })

  registry.register({
    id: 'platform.download-center',
    name: 'Download Center',
    description: '统一下载任务管理与通知',
    scope: 'system',
    status: 'stable'
  })

  registry.register({
    id: 'platform.temp-file',
    name: 'TempFile',
    description: '临时文件创建与清理',
    scope: 'system',
    status: 'beta'
  })

  registry.register({
    id: 'platform.flow-transfer',
    name: 'Flow Transfer',
    description: '插件间数据流转能力',
    scope: 'plugin',
    status: 'beta',
    sensitive: true
  })

  registry.register({
    id: 'platform.division-box',
    name: 'DivisionBox',
    description: '插件浮动窗口与 UI 容器',
    scope: 'plugin',
    status: 'beta'
  })

  registry.register({
    id: 'platform.intelligence-agents',
    name: 'Intelligence Agents',
    description: '智能体任务执行与工具调用',
    scope: 'ai',
    status: 'beta'
  })
}

export const platformCapabilityRegistry = registry
