import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { ITouchPlugin } from '@talex-touch/utils'
import type { PluginStateEvent } from '@talex-touch/utils/plugin/sdk/types'
import { pluginSDK } from '~/modules/sdk/plugin-sdk'

/**
 * Plugin store for managing plugin state
 */
export const usePluginStore = defineStore('plugin', () => {
  const plugins = reactive(new Map<string, ITouchPlugin>())

  /**
   * Set or update a plugin in the store
   * @param plugin - Plugin to add/update
   */
  function setPlugin(plugin: ITouchPlugin): void {
    plugins.set(plugin.name, reactive(plugin))
  }

  /**
   * Get a plugin by name
   * @param name - Plugin name
   * @returns Plugin instance or undefined
   */
  function getPlugin(name: string): ITouchPlugin | undefined {
    return plugins.get(name) as ITouchPlugin
  }

  /**
   * Delete a plugin from the store
   * @param name - Plugin name
   */
  function deletePlugin(name: string): void {
    plugins.delete(name)
  }

  /**
   * Initialize plugins with a full list
   * @param pluginList - Complete list of plugins
   */
  function initPlugins(pluginList: ITouchPlugin[]): void {
    console.log('[PluginStore] Initializing plugins with', pluginList.length, 'plugins')
    plugins.clear()
    pluginList.forEach((plugin) => {
      setPlugin(plugin)
    })
  }

  /**
   * Handle incremental state change events
   * @param event - Plugin state change event
   */
  function handleStateEvent(event: PluginStateEvent): void {
    console.log('[PluginStore] Handling state event:', event.type)

    switch (event.type) {
      case 'added':
        setPlugin(event.plugin)
        console.log(`[PluginStore] Plugin "${event.plugin.name}" added`)
        break

      case 'removed':
        deletePlugin(event.name)
        console.log(`[PluginStore] Plugin "${event.name}" removed`)
        break

      case 'updated':
        if (event.changes) {
          setPlugin(event.changes as ITouchPlugin)
          console.log(`[PluginStore] Plugin "${event.name}" updated`)
        }
        break

      case 'status-changed':
        updatePluginStatus(event.name, event.status)
        console.log(`[PluginStore] Plugin "${event.name}" status changed to ${event.status}`)
        break

      case 'readme-updated':
        updatePluginReadme(event.name, event.readme)
        console.log(`[PluginStore] Plugin "${event.name}" readme updated`)
        break

      default:
        console.warn('[PluginStore] Unknown state event type:', (event as any).type)
    }
  }

  /**
   * Update plugin status
   * @param name - Plugin name
   * @param status - New status
   */
  function updatePluginStatus(name: string, status: number): void {
    const plugin = getPlugin(name)
    if (plugin) {
      plugin.status = status
      console.log(`[PluginStore] Status updated for "${name}": ${status}`)
    } else {
      console.warn(`[PluginStore] Plugin "${name}" not found when updating status`)
    }
  }

  /**
   * Update plugin readme
   * @param name - Plugin name
   * @param readme - New readme content
   */
  function updatePluginReadme(name: string, readme: string): void {
    const plugin = getPlugin(name)
    if (plugin) {
      plugin.readme = readme
    }
  }

  /**
   * Reload a plugin (replace or add)
   * @param plugin - Plugin to reload
   */
  function reloadPlugin(plugin: ITouchPlugin): void {
    const p = getPlugin(plugin.name)
    if (p) {
      const updatedPlugin = reactive(plugin)
      plugins.set(plugin.name, updatedPlugin)
      console.log(`[PluginStore] Plugin "${plugin.name}" reloaded successfully`)
    } else {
      setPlugin(plugin)
      console.log(`[PluginStore] Plugin "${plugin.name}" added during reload`)
    }
  }

  /**
   * Initialize plugin store (subscribe to events and load initial data)
   * @returns Cleanup function
   */
  async function initialize(): Promise<() => void> {
    console.log('[PluginStore] Initializing...')

    const unsubscribe = pluginSDK.subscribe((event) => {
      handleStateEvent(event)
    })

    try {
      const pluginList = await pluginSDK.list()
      console.log('[PluginStore] Loaded', pluginList.length, 'plugins')
      initPlugins(pluginList)
    } catch (error) {
      console.error('[PluginStore] Failed to load initial plugin list:', error)
    }

    return unsubscribe
  }

  return {
    plugins,
    setPlugin,
    getPlugin,
    deletePlugin,
    initPlugins,
    handleStateEvent,
    updatePluginStatus,
    updatePluginReadme,
    reloadPlugin,
    initialize
  }
})

