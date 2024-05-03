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
import { useCoreBox } from "~/modules/hooks/core-box";
import { touchChannel } from "~/modules/channel/channel-core";
import Beginner from "~/views/base/begin/Beginner.vue";
import { storageManager } from "~/modules/channel/storage/index.ts";
import CoreBox from "~/views/box/CoreBox.vue";

const packageJson = window.$nodeApi.getPackageJSON();

const [, pluginsScope] = usePlugins();
const pluginScope = usePlugin();

onBeforeUnmount(() => {
  pluginScope();

  pluginsScope.stop();
});

const _init = ref(false);
const beginner = ref(false);

function init() {
  useCoreBox();

  touchChannel.send("app-ready").then((res: any) => {
    window.$startupInfo = res;

    applicationUpgrade();
    // clipBoardResolver();
    dropperResolver();
    urlHooker();
    // screenCapture()

    _init.value = true;

    if (!storageManager.appSetting?.beginner?.init) beginner.value = true;
  });
}

const _coreBox = ref(false)

onMounted(() => {
  try {
    setTimeout(init, 1000);
  } catch (e) {
    console.error("FATAL ERROR OCCURRED");
    console.error(e);
  }

  _coreBox.value = document.body.classList.contains("core-box")
});
</script>

<template>
  <AppLayout v-if="_init">
    <template #title>
      TalexTouch
      <span class="tag version fake-background">{{ packageJson.version }}</span>
    </template>
  </AppLayout>

  <Beginner v-if="beginner" />
  <CoreBox v-else-if="_coreBox" />
</template>
