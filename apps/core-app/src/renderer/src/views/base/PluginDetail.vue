<script lang="ts" name="PluginDetail" setup>
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import PluginEmptyState from '~/components/plugin/layout/PluginEmptyState.vue'
import PluginInfo from '~/components/plugin/PluginInfo.vue'
import { appSetting } from '~/modules/channel/storage'
import { usePluginSelection } from '~/modules/hooks/usePluginSelection'

const route = useRoute()

const { plugins, curSelect, selectPlugin } = usePluginSelection()

const developerMode = computed(() => Boolean(appSetting?.dev?.developerMode))
const visiblePlugins = computed(() => {
  if (developerMode.value) return plugins.value
  return plugins.value.filter((p) => !p.meta?.internal)
})

const routePluginName = computed(() => {
  const raw = route.params?.name
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed.length ? trimmed : undefined
})

const routePlugin = computed(() => {
  if (!routePluginName.value) return null
  return visiblePlugins.value.find((p) => p.name === routePluginName.value) ?? null
})

const displayedPlugin = computed(() => {
  if (routePluginName.value) return routePlugin.value
  if (!curSelect.value) return null
  if (developerMode.value) return curSelect.value
  return curSelect.value.meta?.internal ? null : curSelect.value
})

watch(
  () => [routePluginName.value, visiblePlugins.value.length] as const,
  async ([name]) => {
    if (!name) return
    const exists = visiblePlugins.value.some((p) => p.name === name)
    if (exists) {
      await selectPlugin(name)
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="h-full">
    <div v-if="displayedPlugin" class="h-full">
      <PluginInfo :plugin="displayedPlugin" />
    </div>
    <PluginEmptyState v-else />
  </div>
</template>
