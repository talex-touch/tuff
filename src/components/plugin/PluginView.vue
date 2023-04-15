<!--<template>-->
<!--  <div ref="dom" class="PluginView-Container" :class="{ active: plugin._status === 4 }">-->
<!--    {{ plugin.webview }}-->
<!--    <webview v-if="plugin?.webview?._" :src="plugin.webview._.indexPath" />-->
<!--  </div>-->
<!--</template>-->

<script>
import { h, nextTick } from 'vue'

export default {
  name: "PluginView",
  props: {
    plugin: {
      type: Object,
      required: true
    }
  },
  render() {
    const getChildren = () => {
      if ( !this.plugin?.webview ) return null

      return h( 'webview' )
    }

    const wrapper = h('div', { class: 'PluginView-Container ' + (this.plugin._status === 4 ? 'active' : '') }, getChildren())

    nextTick(() => {
      const viewData = this.plugin.webview;
      if ( !viewData?._ ) return
      const { _, attrs, styles, js } = viewData

      console.log( viewData )

      viewData.el = wrapper.el

      const webview = wrapper.el.querySelector('webview')

      Object.keys(attrs).forEach(key => {
        webview.setAttribute(key, attrs[key])
      })

      _.preload && webview.setAttribute('preload', "file://" + _.preload)

      webview.setAttribute('src', _.indexPath)

      webview.addEventListener('did-finish-load', () => {
        console.log("Webview dom-ready")

        webview.insertCSS(`${styles}`)
        webview.executeJavaScript(String.raw `${js}`)

        webview.send('@talex-plugin:preload', "${name}")

        webview.openDevTools()
      })
    })

    return wrapper
  }
}
</script>

<style lang="scss" scoped>
.PluginView-Container {
  &.active {
    webview {
      height: 100%;
    }
    visibility: visible;
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