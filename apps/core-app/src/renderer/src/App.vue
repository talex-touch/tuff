<script name="App" lang="ts" setup>
import { isAssistantWindow, isCoreBox } from '@talex-touch/utils/renderer'
import { until } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import TouchMenu from '~/components/menu/TouchMenu.vue'
import TouchMenuItem from '~/components/menu/TouchMenuItem.vue'
import { appSetting } from '~/modules/storage/app-storage'
import { useStartupInfo } from '~/modules/hooks/useStartupInfo'
import Beginner from '~/views/base/begin/Beginner.vue'
import AppLayout from '~/views/layout/AppLayout.vue'
import AppEntrance from './AppEntrance.vue'

const MainWindowRuntimeServices = defineAsyncComponent(
  () => import('~/components/app/MainWindowRuntimeServices.vue')
)
const { t } = useI18n()
useStartupInfo()
const isLightweightWindow = isCoreBox() || isAssistantWindow()

const beginner = ref(false)
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
    @beginner-required="beginner = true"
    @ready="mainRuntimeReady = true"
  />
  <AppEntrance v-if="mainRuntimeReady" :on-ready="init">
    <AppLayout>
      <template #title>
        <span text-sm>{{ t('app.title') }}</span>
      </template>
      <template #navbar>
        <TouchMenu>
          <p class="NavBar-Title">
            {{ t('flatNavBar.main') }}
          </p>
          <TouchMenuItem
            route="/setting"
            :name="t('flatNavBar.setting')"
            icon="i-ri-settings-6-line"
          />
          <TouchMenuItem
            route="/intelligence"
            :name="t('flatNavBar.intelligence')"
            icon="i-carbon-ibm-webmethods-integration-server"
          />
          <TouchMenuItem route="/store" :name="t('flatNavBar.store')" icon="i-ri-quill-pen-line" />
          <TouchMenuItem
            v-if="appSetting.dashboard.enable"
            route="/details"
            :name="t('flatNavBar.details')"
            icon="i-ri-dashboard-line"
          />
          <TouchMenuItem route="/styles" :name="t('flatNavBar.style')" icon="i-ri-paint-line" />
        </TouchMenu>
      </template>
      <template #plugins>
        <PluginNavTree />
      </template>
    </AppLayout>

    <Beginner v-if="beginner" />
  </AppEntrance>
</template>

<style scoped>
.NavBar-Title {
  margin: 0 0 0.5rem 0;
  opacity: 0.25;
  font-size: 12px;
  font-weight: 600;
}
</style>
