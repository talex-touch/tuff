import { randomUUID } from 'node:crypto'

export interface PluginHostContextEntry {
  pluginName: string
  hostGeneration: number
  context: Record<string, unknown>
}

export interface PluginHostContextRegistration {
  pluginHandle: string
  hostGeneration: number
}

export class PluginHostContextRegistry {
  private readonly byHandle = new Map<string, PluginHostContextEntry>()
  private readonly handleByPlugin = new Map<string, string>()

  register(
    pluginName: string,
    hostGeneration: number,
    context: Record<string, unknown>
  ): PluginHostContextRegistration {
    this.unregisterPlugin(pluginName)
    const pluginHandle = randomUUID()
    this.byHandle.set(pluginHandle, { pluginName, hostGeneration, context })
    this.handleByPlugin.set(pluginName, pluginHandle)
    return { pluginHandle, hostGeneration }
  }

  resolve(pluginHandle: string, hostGeneration: number): PluginHostContextEntry | undefined {
    const entry = this.byHandle.get(pluginHandle)
    if (!entry || entry.hostGeneration !== hostGeneration) {
      return undefined
    }
    return entry
  }

  unregisterPlugin(pluginName: string, expectedHandle?: string): boolean {
    const pluginHandle = this.handleByPlugin.get(pluginName)
    if (!pluginHandle || (expectedHandle && pluginHandle !== expectedHandle)) {
      return false
    }
    this.handleByPlugin.delete(pluginName)
    this.byHandle.delete(pluginHandle)
    return true
  }

  clear(): void {
    this.byHandle.clear()
    this.handleByPlugin.clear()
  }
}
