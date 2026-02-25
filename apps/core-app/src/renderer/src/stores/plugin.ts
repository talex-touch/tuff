import type { ITouchPlugin, PluginIssue } from '@talex-touch/utils'
import type { PluginStateEvent } from '@talex-touch/utils/plugin/sdk/types'
import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { toast } from 'vue-sonner'
import { pluginSDK } from '~/modules/sdk/plugin-sdk'

/**
 * Plugin store for managing plugin state
 */
export const usePluginStore = defineStore('plugin', () => {
  const plugins = reactive(new Map<string, ITouchPlugin>())
  const notifiedCategoryMissing = new Set<string>()

  type PluginWithInstallSource = ITouchPlugin & {
    installSource?: unknown
  }

  function maybeNotifyPluginIssues(plugin: ITouchPlugin): void {
    const hasCategoryMissing = plugin.issues?.some((issue) => issue.code === 'CATEGORY_MISSING')
    if (!hasCategoryMissing) return

    if (notifiedCategoryMissing.has(plugin.name)) return
    notifiedCategoryMissing.add(plugin.name)

    toast.error(`插件「${plugin.name}」缺少分类字段 category，已拒绝启动`, {
      description: '请在 manifest.json 补充 "category": "utilities"（sdkapi >= 260114 必填）。'
    })
  }

  /**
   * Set or update a plugin in the store
   * @param plugin - Plugin to add/update
   */
  function setPlugin(plugin: ITouchPlugin): void {
    const incoming = plugin as PluginWithInstallSource
    const current = plugins.get(plugin.name) as PluginWithInstallSource | undefined

    const normalizedPlugin =
      incoming.installSource === undefined && current?.installSource !== undefined
        ? ({ ...incoming, installSource: current.installSource } as PluginWithInstallSource)
        : incoming

    plugins.set(plugin.name, reactive(normalizedPlugin))
    maybeNotifyPluginIssues(normalizedPlugin)
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
    if (!Array.isArray(pluginList)) {
      console.error('[PluginStore] Invalid plugin list received:', pluginList)
      return
    }
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
    switch (event.type) {
      case 'added':
        setPlugin(event.plugin)
        break

      case 'removed':
        deletePlugin(event.name)
        break

      case 'updated':
        if (event.changes) {
          setPlugin(event.changes as ITouchPlugin)
        }
        break

      case 'status-changed':
        updatePluginStatus(event.name, event.status)
        break

      case 'readme-updated':
        updatePluginReadme(event.name, event.readme)
        break

      case 'issue-created':
        upsertPluginIssue(event.name, event.issue as PluginIssue)
        break

      case 'issue-updated':
        upsertPluginIssue(event.name, event.issue as PluginIssue)
        break

      case 'issue-deleted':
        removePluginIssue(event.name, event.issueId)
        break

      case 'issues-reset':
        resetPluginIssues(event.name, event.issues as PluginIssue[])
        break

      default: {
        const unknownEvent = event as { type?: string }
        console.warn('[PluginStore] Unknown state event type:', unknownEvent.type ?? 'unknown')
      }
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

  function resolveIssueId(issue: PluginIssue): string {
    const id = typeof issue.id === 'string' ? issue.id.trim() : ''
    if (id) return id
    const code = typeof issue.code === 'string' ? issue.code.trim() : ''
    const source = typeof issue.source === 'string' ? issue.source.trim() : ''
    if (code || source) return `${code || 'NO_CODE'}::${source || 'NO_SOURCE'}`
    return `ISSUE::${issue.message}`
  }

  function upsertPluginIssue(name: string, issue: PluginIssue): void {
    const plugin = getPlugin(name)
    if (!plugin) return

    const nextIssue: PluginIssue = {
      ...issue,
      id: resolveIssueId(issue)
    }
    const issues = Array.isArray(plugin.issues) ? plugin.issues : []
    const issueIndex = issues.findIndex((item) => resolveIssueId(item) === nextIssue.id)

    if (issueIndex >= 0) {
      const nextIssues = [...issues]
      nextIssues[issueIndex] = nextIssue
      plugin.issues = nextIssues
      return
    }

    plugin.issues = [...issues, nextIssue]
  }

  function removePluginIssue(name: string, issueId: string): void {
    const plugin = getPlugin(name)
    if (!plugin) return
    const issues = Array.isArray(plugin.issues) ? plugin.issues : []
    plugin.issues = issues.filter((issue) => resolveIssueId(issue) !== issueId)
  }

  function resetPluginIssues(name: string, issues: PluginIssue[]): void {
    const plugin = getPlugin(name)
    if (!plugin) return
    plugin.issues = issues.map((issue) => ({
      ...issue,
      id: resolveIssueId(issue)
    }))
  }

  /**
   * Initialize plugin store (subscribe to events and load initial data)
   * @returns Cleanup function
   */
  async function initialize(): Promise<() => void> {
    const unsubscribe = pluginSDK.subscribe((event) => {
      handleStateEvent(event)
    })

    try {
      const pluginList = await pluginSDK.list()
      if (!Array.isArray(pluginList)) {
        console.error('[PluginStore] Invalid plugin list received:', pluginList)
        return unsubscribe
      }
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
    upsertPluginIssue,
    removePluginIssue,
    resetPluginIssues,
    initialize
  }
})
