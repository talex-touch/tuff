<script lang="ts" name="AppSettings" setup>
import { computed, defineAsyncComponent } from 'vue'
import ViewTemplate from '~/components/base/template/ViewTemplate.vue'
import SettingHeader from './SettingHeader.vue'
import SettingLanguage from './SettingLanguage.vue'
import SettingSetup from './SettingSetup.vue'
import SettingTools from './SettingTools.vue'
import SettingUser from './SettingUser.vue'

const SettingAbout = defineAsyncComponent(() => import('./SettingAbout.vue'))
const SettingDownload = defineAsyncComponent(() => import('./SettingDownload.vue'))
const SettingEverything = defineAsyncComponent(() => import('./SettingEverything.vue'))
const SettingFileIndex = defineAsyncComponent(() => import('./SettingFileIndex.vue'))
const SettingSentry = defineAsyncComponent(() => import('./SettingSentry.vue'))
const SettingStorage = defineAsyncComponent(() => import('./SettingStorage.vue'))
const SettingUpdate = defineAsyncComponent(() => import('./SettingUpdate.vue'))

const isWindows = computed(() => window.electron?.process?.platform === 'win32')
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

      <SettingStorage />

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

  min-height: 100%;
  padding-bottom: 24px;
  width: 100%;
}
</style>
