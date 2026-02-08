<script name="App" lang="ts" setup>
import { isCoreBox } from '@talex-touch/utils/renderer'
import { appSettings } from '@talex-touch/utils/renderer/storage'
import { useI18n } from 'vue-i18n'
import TouchMenu from '~/components/menu/TouchMenu.vue'
import TouchMenuItem from '~/components/menu/TouchMenuItem.vue'
import { usePermissionStartup } from '~/composables/usePermissionStartup'
import { appSetting } from '~/modules/channel/storage/index'
import { useDropperResolver } from '~/modules/hooks/dropper-resolver'
import { useGlobalBatteryOptimizer } from '~/modules/hooks/useBatteryOptimizer'
import { useStartupInfo } from '~/modules/hooks/useStartupInfo'
import { useLanguage } from '~/modules/lang'
import { captureAppContext } from '~/modules/mention/dialog-mention'
import { capturePlatformWarningContext } from '~/modules/mention/platform-warning'
import Beginner from '~/views/base/begin/Beginner.vue'
import AppLayout from '~/views/layout/AppLayout.vue'
import AppEntrance from './AppEntrance.vue'

const { t } = useI18n()
const { initializeLanguage } = useLanguage()
useStartupInfo()

const beginner = ref(false)

captureAppContext()
capturePlatformWarningContext()
usePermissionStartup()
useGlobalBatteryOptimizer()

/**
 * Initialize renderer-only services once the lifecycle is ready.
 */
async function init(): Promise<void> {
  if (isCoreBox()) {
    return
  }

  try {
    await initializeLanguage()
  } catch (error) {
    console.error('[App] Failed to initialize language:', error)
  }

  useDropperResolver()

  await appSettings.whenHydrated()
  if (!appSetting?.beginner?.init) beginner.value = true
}
</script>

<template>
  <AppEntrance :on-ready="init">
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
          <TouchMenuItem
            route="/market"
            :name="t('flatNavBar.market')"
            icon="i-ri-quill-pen-line"
          />
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
