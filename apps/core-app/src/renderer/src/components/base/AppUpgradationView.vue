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

<script lang="ts" name="AppUpgradationView" setup>
import { inject } from "vue";
import FlatMarkdown from "@comp/base/input/FlatMarkdown.vue";
import FlatButton from "@comp/base/button//FlatButton.vue";

const props = defineProps({
  release: {
    type: Object,
    required: true,
  },
});
const close = inject("destroy");

function upgrade() {
  window.$nodeApi.openExternal(props.release.html_url);
}
</script>

<style lang="scss" scoped>
:deep(.FlatMarkdown-Container) {
  position: relative;

  max-height: calc(85vh - 220px);

  font-size: 12px;
}

.AppUpgradation-Container {
  position: relative;

  height: 100vh;
}

.AppUpgradation-Content {
  position: relative;
  margin: 8px 5px;
  display: flex;

  justify-content: space-around;

  gap: 2rem;

  height: 40px;

  // bottom: 1.5rem;
}
</style>
