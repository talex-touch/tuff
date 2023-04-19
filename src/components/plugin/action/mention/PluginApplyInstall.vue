<template>
  <div class="PluginApplyInstall-Container">
    <p>新插件</p>
<!--    <div class="PluginApplyInstall-Main">-->
<!--      <PluginIcon :icon="manifest.icon" />-->
<!--    </div>-->
    <h4>{{ manifest.description }}</h4>
    <span>{{ manifest.version }}</span>
    <div class="PluginApplyInstall-Button">
      <FlatButton v-wave @click="close">忽略</FlatButton>
      <FlatButton v-wave :primary="true" @click="install">安装</FlatButton>
    </div>
  </div>
</template>

<script>
export default {
  name: "PluginApplyInstall"
}
</script>

<script setup>
import FlatButton from "@comp/button/FlatButton.vue";
import { inject } from "vue";
import { blowMention } from "@modules/mention/dialog-mention";
import { sleep } from "@modules/utils";

const props = defineProps(["manifest"])

const close = inject("destroy")

async function install() {
  await blowMention('抱歉', '现在无法完成安装!')

  // await sleep( 200 )

  close()
}

</script>

<style lang="scss" scoped>
.PluginApplyInstall-Container {
  .PluginApplyInstall-Button {
    display: flex;
    justify-content: space-between;
    margin-top: 16px;

    gap: 16px;
  }
  h4 {
    text-align: center;
  }
}
</style>