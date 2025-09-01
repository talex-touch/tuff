import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { ITouchPlugin } from '@talex-touch/utils'

export const usePluginStore = defineStore('plugin-adapter', () => {
  const plugins = reactive(new Map<string, ITouchPlugin>())

  function setPlugin(plugin: ITouchPlugin): void {
    plugins.set(plugin.name, reactive(plugin))
  }

  function getPlugin(name: string): ITouchPlugin | undefined {
    return plugins.get(name) as ITouchPlugin
  }

  function deletePlugin(name: string): void {
    plugins.delete(name)
  }

  function updatePluginStatus(name: string, status: number): void {
    const plugin = getPlugin(name)
    if (plugin) {
      plugin.status = status
    }
  }

  function updatePluginReadme(name: string, readme: string): void {
    const plugin = getPlugin(name)
    if (plugin) {
      plugin.readme = readme
    }
  }

  function reloadPlugin(plugin: ITouchPlugin): void {
    const p = getPlugin(plugin.name)
    if (p) {
      Object.assign(p, plugin)
    }
  }

  return {
    plugins,
    setPlugin,
    getPlugin,
    deletePlugin,
    updatePluginStatus,
    updatePluginReadme,
    reloadPlugin
  }
})
