<script lang="ts" name="AppSettings" setup>
import { computed } from 'vue'
import ViewTemplate from '~/components/base/template/ViewTemplate.vue'
// import SettingStorage from './SettingStorage.vue'
import SettingAbout from './SettingAbout.vue'
import SettingDownload from './SettingDownload.vue'
import SettingFileIndex from './SettingFileIndex.vue'
import SettingEverything from './SettingEverything.vue'
import SettingHeader from './SettingHeader.vue'
import SettingLanguage from './SettingLanguage.vue'
import SettingMessages from './SettingMessages.vue'
import SettingSentry from './SettingSentry.vue'
import SettingSetup from './SettingSetup.vue'
import SettingTools from './SettingTools.vue'
import SettingUpdate from './SettingUpdate.vue'
import SettingUser from './SettingUser.vue'

const isWindows = computed(() => window.electron?.process?.platform === 'win32')
const isDev = import.meta.env.DEV
</script>

<template>
  <ViewTemplate title="Settings">
    <div class="AppSettings-Container">
      <SettingHeader />

      <SettingUser />

      <SettingLanguage />

      <SettingSetup />

      <SettingTools />

      <SettingFileIndex />

      <SettingEverything v-if="isWindows" />

      <SettingDownload />

      <SettingUpdate />

      <SettingSentry />

      <SettingMessages v-if="isDev" />

      <!-- <SettingStorage /> -->

      <SettingAbout />
    </div>
  </ViewTemplate>
</template>

<style lang="scss" scoped>
.Usage {
  &:before {
    content: '';
    position: absolute;

    left: 0;
    top: 0;

    width: var(--percent, 100%);
    max-width: 100%;
    height: 100%;

    background-color: var(--color, var(--el-color-info));
    border-radius: 2px;
    transition: 1s linear;
  }

  &:after {
    content: attr(data-text);
    position: absolute;

    left: 80%;
  }

  position: relative;
  display: inline-block;

  width: 120px;
  height: 20px;

  border-radius: 4px;
  border: 1px solid var(--el-border-color);
}

.AppSettings-Container {
  position: relative;

  height: 100%;
  width: 100%;
}
</style>
