<script name="App" lang="ts" setup>
import AppLayout from '~/views/layout/AppLayout.vue'
import { useDropperResolver } from '~/modules/hooks/dropper-resolver'
import { captureAppContext } from '~/modules/mention/dialog-mention'
// urlHooker,
// clipBoardResolver,
import Beginner from '~/views/base/begin/Beginner.vue'
import { appSetting } from '~/modules/channel/storage/index'
import { isCoreBox } from '@talex-touch/utils/renderer'
import AppEntrance from './AppEntrance.vue'
import { useI18n } from 'vue-i18n'
import { useLanguage } from '~/modules/lang'

const { t } = useI18n()
const { initializeLanguage } = useLanguage()

const packageJson = window.$nodeApi.getPackageJSON()

const beginner = ref(false)

// 在 setup 的同步代码中立即捕获应用上下文
// 这样对话框函数就可以在任何地方（包括事件监听器）使用
captureAppContext()

async function init(): Promise<void> {
  if (isCoreBox()) {
    return
  }

  try {
    await initializeLanguage()
  } catch (error) {
    console.error('[App] Failed to initialize language:', error)
  }

  // clipBoardResolver()
  // urlHooker()
  // screenCapture()
  useDropperResolver()

  if (!appSetting?.beginner?.init) beginner.value = true
}
</script>

<template>
  <AppEntrance :on-ready="init">
    <!-- <BuildSecurityBanner /> -->
    <AppLayout>
      <template #title>
        <span text-sm>{{ t('app.title') }}</span>
        <span
          style="--fake-radius: 4px"
          class="px-[3px] py-[1px] rounded-md text-xs version fake-background"
          >{{ packageJson.version }}</span
        >
      </template>
    </AppLayout>

    <Beginner v-if="beginner" />
  </AppEntrance>
</template>
