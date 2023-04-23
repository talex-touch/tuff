<template>
  <div class="PluginView-Container" :class="{ active: plugin._status === 4 }">
    <webview ref="webviewDom" :class="{ exist: plugin._status === 3 || plugin._status === 4 }" />
  </div>
</template>

<script>

export default {
  name: "PluginView",
}
</script>

<script setup>
import { nextTick, onMounted, onUpdated, ref, watchEffect } from "vue";
import { forDialogMention } from "@modules/mention/dialog-mention";
import { pluginManager } from "@modules/samples/node-api";

const props = defineProps({
  plugin: {
    type: Object,
    required: true
  }
})

const webviewDom = ref(null)

let _init = false
function init() {
  if ( _init ) return
  _init = true

  const viewData = props.plugin.webview;
  if ( !viewData?._ ) return
  const { _, attrs, styles, js } = viewData

  const webview = webviewDom.value
  console.log( props.plugin, webview )
  if ( !webview ) return

  viewData.el = webview.parentElement

  Object.keys(attrs).forEach(key => {
    webview.setAttribute(key, attrs[key])
  })

  _.preload && webview.setAttribute('preload', "file://" + _.preload)

  webview.addEventListener('crashed', () => {
    console.log("Webview crashed", props.plugin)
  })

  webview.addEventListener('did-fail-load', async (e) => {
    console.log("Webview did-fail-load", e, props.plugin)

    await forDialogMention( props.plugin.pluginInfo.name, e.errorDescription, props.plugin.pluginInfo.icon, [
      {
        content: "忽略加载",
        type: 'info',
        onClick: () => true
      },
      {
        content: "重启插件",
        type: 'warning',
        onClick: () => pluginManager.reloadPlugin(props.plugin.pluginInfo.name) && true
      }
    ] )

  })

  webview.addEventListener('did-finish-load', () => {
    if ( props.plugin._status === 4 )
      webview.openDevTools()

    webview.insertCSS(`${styles}`)
    webview.executeJavaScript(String.raw `${js}`)

    webview.send('@talex-plugin:preload', "${name}")

    console.log("Webview did-finish-load", props.plugin)
  })

  webview.setAttribute('src', _.indexPath )

}

watchEffect(() => {
  const status = props.plugin._status
  if ( status === 3 || status === 4 ) {
    nextTick(init)
  } else _init = false
})
</script>

<style lang="scss" scoped>
.PluginView-Container {
  &.active {
    visibility: visible;
  }
  webview.exist {
    display: flex !important;
    height: 100%;
  }
  webview {
    display: none;
  }
  z-index: 9999;
  position: absolute;

  left: 0;
  top: 0;

  width: 100%;
  height: 100%;

  visibility: hidden;
}
</style>