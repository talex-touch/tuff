<script name="ViewPlugin" setup>
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import PluginView from '~/components/plugin/PluginView.vue'
import { appSetting } from '~/modules/channel/storage'

const transport = useTuffTransport()
const pluginMessageTransportEvent = defineRawEvent('plugin:message-transport')
const options = computed(() => appSetting.background ?? {})
const activePlugin = inject('activePlugin')
const plugins = inject('plugins')
// const plugins = computed(() => _plugins());

const pendingLists = reactive({})
let disposePluginMessageListener = null

onMounted(() => {
  try {
    disposePluginMessageListener = transport.on(pluginMessageTransportEvent, async (_data) => {
      // console.log("[Plugin] Receive message from plugin", _data)
      const { data, plugin } = _data || {}
      if (!plugins.value.filter((item) => item.name === plugin)?.length) {
        delete pendingLists[plugin]
        return {
          code: 404,
          message: 'Plugin not found'
        }
      }

      return await new Promise((resolve) => {
        const pendingList = pendingLists[plugin] || (pendingLists[plugin] = [])
        pendingList.push({
          data,
          reply: resolve
        })
      })
    })
  } catch (error) {
    console.warn('[ViewPlugin] Failed to register plugin message transport listener', error)
  }
})

onUnmounted(() => {
  disposePluginMessageListener?.()
  disposePluginMessageListener = null
})
</script>

<template>
  <div
    class="Blur-Container"
    :class="{ 'touch-blur': options?.blur || true, active: activePlugin }"
  >
    <PluginView
      v-for="plugin in plugins"
      :id="`${plugin.name}-plugin-view`"
      :key="plugin.name"
      :plugin="plugin"
      :lists="pendingLists[plugin.name] || []"
    />
  </div>
</template>

<style lang="scss" scoped>
.Blur-Container {
  &.active {
    opacity: 1;
    pointer-events: all;
  }

  opacity: 0;
  pointer-events: none;
  -webkit-app-region: no-drag;
}
</style>
