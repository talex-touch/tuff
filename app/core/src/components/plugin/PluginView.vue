<template>
  <div
    class="PluginView-Container"
    :class="{ active: status === 4, done }"
  >
    <div class="PluginView-Loader cubic-transition">
      <Loading />
      <span>Plugin is loading...</span>
    </div>
    <webview
      ref="webviewDom"
      :class="{ exist: status === 3 || status === 4 }"
    />
  </div>
</template>

<script>
export default {
  name: "PluginView",
};
</script>

<script setup>
import { forDialogMention } from "@modules/mention/dialog-mention";
import { pluginManager } from "@modules/channel/plugin-core/api";
import Loading from "@comp/icon/LoadingIcon.vue";

const props = defineProps({
  plugin: {
    type: Object,
    required: true,
  },
  lists: {
    type: Object,
    required: true,
  },
});
const loadDone = ref(false);
const status = computed(() => props.plugin?.status || 0);
const done = computed(
  () => (status.value === 3 || status.value === 4) && loadDone.value
);

const webviewDom = ref();

onBeforeUnmount(() => {
  const webView = webviewDom.value

  webView.closeDevTools()
});

function handleListeners(viewData, webview) {
  const { styles, js } = viewData;

  webview.addEventListener("crashed", () => {
    console.log("Webview crashed", props.plugin);
  });

  webview.addEventListener("did-fail-load", async (e) => {
    // console.log("Webview did-fail-load", e, props.plugin);

    await forDialogMention(
      props.plugin.name,
      e.errorDescription,
      props.plugin.icon,
      [
        {
          content: "Ignore Load",
          type: "info",
          onClick: () => true,
        },
        {
          content: "Restart plugin",
          type: "warning",
          onClick: () => pluginManager.reloadPlugin(props.plugin.name) && true,
        },
      ]
    );
  });

  webview.addEventListener("did-finish-load", async () => {
    if (status.value === 4) webview.openDevTools();

    webview.insertCSS(`${styles}`);
    await webview.executeJavaScript(`${js}`);

    // console.log("Webview did-finish-load", props.plugin);

    webview.send("@loaded", { plugin: props.plugin.name, id: webview.id, type: 'init' })

    watchEffect(async () => {
      while (props.lists.length) {
        const { data } = props.lists.pop();
        // console.log("--->", props.plugin, data);
        const res = await webview.send("@plugin-process-message", JSON.stringify(data));

        // console.log("<---", props.plugin, res);

        if (data.reply) {
          data.reply(res);
        }
      }
    });

    // console.log("Webview did-finish-load", props.plugin);
    loadDone.value = true;
  });
}

function init() {
  const viewData = props.plugin.webview;
  if (!viewData) return;
  const { _, attrs } = viewData;

  pluginManager.setPluginWebviewInit(props.plugin.name);
  props.plugin.webViewInit = true;

  const webview = webviewDom.value;
  // console.log(props.plugin, webview, viewData);

  viewData.el = webview.parentElement;

  Object.keys(attrs).forEach((key) => {
    webview.setAttribute(key, attrs[key]);
  });

  _.preload && webview.setAttribute("preload", "file://" + _.preload);

  handleListeners(viewData, webview);

  loadDone.value = false;
  webview.setAttribute("src", _.indexPath);
}

watch(status, (val, oldVal) => {
  if (props.plugin?.webViewInit) return;

  if ((val === 3 && oldVal === 4) || (oldVal === 3 && val === 4)) init();
  // else if ( val === 4 ) webviewDom.value.openDevTools()
  // else webviewDom.value.closeDevTools()
});
</script>

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
