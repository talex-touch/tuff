<script>
import { h } from 'vue'

export default {
  name: "PluginView",
  render() {
    return h('div', { class: "PluginView-Wrapper", id: "PluginView-Wrapper" })
  }
}
</script>

<style>
.PluginView-Wrapper {
  position: absolute;

  width: 100%;
  height: 100%;
}

.PluginView-Wrapper webview {
  position: absolute;

  width: 100%;
  height: 100%;
}
</style>