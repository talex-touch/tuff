<script name="App" lang="ts" setup>
import AppLayout from "~/views/layout/AppLayout.vue";
import {
  applicationUpgrade,
  clipBoardResolver,
  dropperResolver,
  urlHooker,
  usePlugin,
  usePlugins,
} from "~/modules/hooks/application-hooks";
import { touchChannel } from "~/modules/channel/channel-core";

const packageJson = window.$nodeApi.getPackageJSON();

const [, pluginsScope] = usePlugins();
const pluginScope = usePlugin();

onBeforeUnmount(() => {
  pluginScope();

  pluginsScope.stop();
});

const _init = ref(false);

function init() {
  touchChannel.send("app-ready").then((res: any) => {
    window.$startupInfo = res;

    applicationUpgrade();
    clipBoardResolver();
    dropperResolver();
    urlHooker();
    // screenCapture()

    _init.value = true;
  });
}

onMounted(() => {
  try {
    setTimeout(init, 1000);
  } catch (e) {
    console.error("FATAL ERROR OCCURRED");
    console.error(e);
  }
});
</script>

<template>
  <AppLayout v-if="_init">
    <template #title>
      TalexTouch
      <span class="tag version fake-background">{{ packageJson.version }}</span>
    </template>
  </AppLayout>
</template>
