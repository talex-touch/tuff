import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
import { pluginManager } from '~/modules/channel/plugin-core/api'
import { ITouchPlugin } from '@talex-touch/utils'

export const usePluginStore = defineStore('plugin-adapter', () => {
  const plugins = reactive(new Map<string, ITouchPlugin>())
  const activePlugin = ref('')
  const lastActivePlugin = ref('')

  watch(
    () => activePlugin.value,
    (val) => {
      pluginManager.changeActivePlugin(val)
    },
    { immediate: true }
  )

  watch(
    () => plugins,
    () => {
      if (activePlugin?.value) {
        if (!plugins.has(activePlugin.value)) {
          lastActivePlugin.value = activePlugin.value
          activePlugin.value = ''
        }
      } else if (plugins.has(lastActivePlugin.value) && lastActivePlugin.value) {
        setTimeout(() => {
          activePlugin.value = lastActivePlugin.value
          lastActivePlugin.value = ''

          const id = `touch-plugin-item-${activePlugin.value}`

          setTimeout(() => {
            const el = document.getElementById(id)
            if (!el) return

            el['$fixPointer']?.()
          }, 200)
        }, 200)
      }
    },
    {
      deep: true
    }
  )

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
      // @ts-ignore exist
      p!['webViewInit'] = false
    }
  }

  return {
    plugins,
    activePlugin,
    lastActivePlugin,
    setPlugin,
    getPlugin,
    deletePlugin,
    updatePluginStatus,
    updatePluginReadme,
    reloadPlugin
  }
})
