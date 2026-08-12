<script name="App" lang="ts" setup>
import { isAssistantWindow, isCoreBox } from '@talex-touch/utils/renderer'
import { until } from '@vueuse/core'
import { useBeginnerGuide } from '~/composables/useBeginnerGuide'
import { useStartupInfo } from '~/modules/hooks/useStartupInfo'
import Beginner from '~/views/base/begin/Beginner.vue'
import AppShell from '~/views/layout/AppShell.vue'
import AppEntrance from './AppEntrance.vue'

const MainWindowRuntimeServices = defineAsyncComponent(
  () => import('~/components/app/MainWindowRuntimeServices.vue')
)
useStartupInfo()
const isLightweightWindow = isCoreBox() || isAssistantWindow()

const { visible: beginner, open: openBeginner } = useBeginnerGuide()
const mainRuntimeReady = ref(isLightweightWindow)

/**
 * Initialize renderer-only services once the lifecycle is ready.
 */
async function init(): Promise<void> {
  if (isLightweightWindow) {
    return
  }

  if (!mainRuntimeReady.value) {
    await until(mainRuntimeReady).toBe(true)
  }
}
</script>

<template>
  <MainWindowRuntimeServices
    v-if="!isLightweightWindow"
    @beginner-required="openBeginner"
    @ready="mainRuntimeReady = true"
  />
  <AppEntrance v-if="mainRuntimeReady" :on-ready="init">
    <!--
      `AppShell` owns navigation now, so the old `#navbar` / `#plugins` / `#title` slots are gone.

      - store / intelligence / setting moved into `ShellSidebar` as first-class nav items.
      - details and styles left the sidebar; their routes stay reachable and get re-homed under
        settings categories in 08-04-settings-ia-primitives.
      - `PluginNavTree` (components/plugin/PluginNavTree.vue) has no place in the v2 sidebar and is
        intentionally unmounted here — NOT dead code. It gets re-mounted under
        「设置 › 插件与工具」 in 08-04-settings-ia-primitives.
    -->
    <AppShell />

    <Beginner v-if="beginner" />
  </AppEntrance>
</template>
