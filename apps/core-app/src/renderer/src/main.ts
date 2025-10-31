import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

import router from './base/router'
import { baseNodeApi } from '~/modules/channel/main/node'
import { shortconApi } from '~/modules/channel/main/shortcon'
import { storageManager } from '~/modules/channel/storage'
import { usePluginStore } from '~/stores/plugin'
import { setupI18n } from '~/modules/lang'
import ElementPlus from 'element-plus'
import VWave from 'v-wave'

import { preloadDebugStep, preloadLog, preloadState } from '@talex-touch/utils/preload'
import {
  showPlatformCompatibilityWarning,
  shouldShowPlatformWarning
} from '~/modules/mention/platform-warning'
import { isCoreBox } from '@talex-touch/utils/renderer/hooks/arg-mapper'

import './assets/main.css'
import '~/styles/element/index.scss'
import '~/styles/index.scss'

import 'uno.css'
import 'virtual:unocss-devtools'

window.$nodeApi = baseNodeApi
window.$shortconApi = shortconApi
window.$storage = storageManager

preloadState('start')
preloadLog('Bootstrapping Talex Touch renderer...')

async function bootstrap() {
  preloadDebugStep('Loading localization resources...', 0.05)

  // 从本地存储获取语言设置，如果没有则使用系统语言或默认中文
  let initialLanguage = localStorage.getItem('app-language')

  // 如果没有保存的语言设置，检查是否跟随系统语言
  if (!initialLanguage) {
    const followSystem = localStorage.getItem('app-follow-system-language') === 'true'
    if (followSystem) {
      // 检测系统语言
      const systemLang = navigator.language || 'en-US'
      if (systemLang.startsWith('zh')) {
        initialLanguage = 'zh-CN'
      } else if (systemLang.startsWith('en')) {
        initialLanguage = 'en-US'
      } else {
        initialLanguage = 'zh-CN' // 默认中文
      }
    } else {
      initialLanguage = 'zh-CN' // 默认中文
    }
  }

  const i18n = await setupI18n({ locale: initialLanguage })
  ;(window as any).$i18n = i18n

  preloadDebugStep('Creating Vue application instance', 0.05)
  const app = createApp(App)

  preloadDebugStep('Registering plugins and global modules', 0.05)
  app.use(router).use(ElementPlus).use(createPinia()).use(VWave, {}).use(i18n)

  // CoreBox 窗口不需要初始化插件列表
  if (!isCoreBox()) {
    preloadDebugStep('Initializing plugin store', 0.05)
    const pluginStore = usePluginStore()
    await pluginStore.initialize()
  }

  preloadDebugStep('Mounting renderer root container', 0.05)
  app.mount('#app')

  preloadDebugStep('Checking platform compatibility', 0.02)
  // 检查平台兼容性并显示警告
  checkPlatformCompatibility()

  preloadDebugStep('Renderer shell mounted', 0.02)
}

/**
 * 检查平台兼容性并显示警告
 */
async function checkPlatformCompatibility() {
  try {
    // 等待应用准备就绪
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // 检查是否应该显示警告
    if (!shouldShowPlatformWarning()) {
      return
    }

    // 获取平台信息
    const appInfo = await window.$nodeApi.send('app-ready')

    if (appInfo?.platformWarning) {
      await showPlatformCompatibilityWarning(appInfo.platformWarning)
    }
  } catch (error) {
    console.warn('Failed to check platform compatibility:', error)
  }
}

bootstrap().catch((error) => {
  console.error('main.ts: Bootstrap process failed:', error)
})
