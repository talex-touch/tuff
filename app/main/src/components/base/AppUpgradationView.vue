<template>
  <div class="AppUpgradation-Container">
    <p>New Version Available</p>
    <span>{{ release.published_at }}</span>
    <br />
    <FlatMarkdown :model-value="release.body" :readonly="true" />

    <div class="AppUpgradation-Content">
      <FlatButton @click="close">Not now</FlatButton>
      <FlatButton @click="upgrade" :primary="true">Update</FlatButton>
    </div>
  </div>
</template>

<script name="AppUpgradationView" setup>
import { inject, onMounted } from "vue";
import FlatMarkdown from "@comp/base/input/FlatMarkdown.vue";
import FlatButton from "@comp/base/button//FlatButton.vue";

const props = defineProps(['release'])
const close = inject('destroy')

function upgrade() {
  window.$nodeApi.openExternal(props.release.html_url)
}
</script>

<style lang="scss" scoped>
:deep(.FlatMarkdown-Container) {
  position: relative;

  max-height: calc(85vh - 200px);

  font-size: 12px;
}

.AppUpgradation-Container {
  position: relative;

  height: 100vh;
}

.AppUpgradation-Content {
  margin: 16px 5px;
  display: flex;

  gap: 16px;
}
</style>