<script setup>
import Loading from '~/components/icon/LoadingIcon.vue'
import { forDialogMention } from '~/modules/mention/dialog-mention'
import { pluginSDK } from '~/modules/sdk/plugin-sdk'

defineOptions({ name: 'PluginView' })

const props = defineProps({
  plugin: {
    type: Object,
    required: true
  }
})

const loadDone = ref(false)
const status = computed(() => props.plugin?.status || 0)
const done = computed(() => (status.value === 3 || status.value === 4) && loadDone.value)

const webviewDom = ref()
const { t } = useI18n()

function pluginLogMeta() {
  return {
    name: props.plugin?.name,
    status: status.value
  }
}

onBeforeUnmount(() => {
  const webView = webviewDom.value

  webView.closeDevTools()
})

function handleListeners(viewData, webview) {
  const { styles, js } = viewData

  webview.addEventListener('crashed', () => {
    console.error('[PluginView] Webview crashed', pluginLogMeta())
  })

  webview.addEventListener('did-fail-load', async (e) => {
    console.warn('[PluginView] Webview did-fail-load', {
      errorCode: e.errorCode,
      errorDescription: e.errorDescription,
      ...pluginLogMeta()
    })

    await forDialogMention(props.plugin.name, e.errorDescription, props.plugin.icon, [
      {
        content: t('plugin.view.ignoreLoad'),
        type: 'info',
        onClick: () => true
      },
      {
        content: t('plugin.view.restart'),
        type: 'warning',
        onClick: () => pluginSDK.reload(props.plugin.name) && true
      }
    ])

    // When failed => close devtool
    webview.closeDevTools()
  })

  webview.addEventListener('did-finish-load', async () => {
    if (status.value === 4) webview.openDevTools()

    webview.insertCSS(`${styles}`)
    await webview.executeJavaScript(`${js}`)

    webview.send('@loaded', { plugin: props.plugin.name, id: webview.id, type: 'init' })

    loadDone.value = true
  })
}

function init() {
  const viewData = props.plugin.webview
  if (!viewData) return
  const { _, attrs } = viewData

  pluginManager.setPluginWebviewInit(props.plugin.name)
  props.plugin.webViewInit = true

  const webview = webviewDom.value

  viewData.el = webview.parentElement

  Object.keys(attrs).forEach((key) => {
    webview.setAttribute(key, attrs[key])
  })

  _.preload && webview.setAttribute('preload', `file://${_.preload}`)

  handleListeners(viewData, webview)

  loadDone.value = false
  webview.setAttribute('src', _.indexPath)
}

watch(status, (val, oldVal) => {
  if (props.plugin?.webViewInit) return

  if ((val === 3 && oldVal === 4) || (oldVal === 3 && val === 4)) init()
})
</script>

<template>
  <div class="PluginView-Container" :class="{ active: status === 4, done }">
    <div class="PluginView-Loader cubic-transition">
      <Loading />
      <span>{{ t('plugin.view.loading') }}</span>
    </div>
    <webview ref="webviewDom" :class="{ exist: status === 3 || status === 4 }" />
  </div>
</template>

<style lang="scss" scoped>
.PluginView-Loader {
  position: absolute;
  display: flex;
  padding: 8px;

  gap: 12px;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  left: 50%;
  top: 50%;

  border-radius: 8px;
  box-sizing: border-box;
  background-color: rgba(0, 0, 0, 0.5);
  transform: translate(-50%, -50%);
}

.PluginView-Container {
  &.done {
    .PluginView-Loader {
      opacity: 0;
      pointer-events: none;
      transform: translate(-50%, -50%) scale(1.2);
    }
  }

  &.active {
    opacity: 1;
    pointer-events: all;
  }

  webview {
    height: 100%;
  }

  position: absolute;

  left: 0;
  top: 0;

  width: 100%;
  height: 100%;

  opacity: 0;
  pointer-events: none;
}
</style>
