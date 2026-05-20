<script lang="ts" name="AppSettings" setup>
import { computed, defineAsyncComponent, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import ViewTemplate from '~/components/base/template/ViewTemplate.vue'
import { appSetting } from '~/modules/storage/app-storage'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'
import SettingHeader from './SettingHeader.vue'
import SettingAssistant from './SettingAssistant.vue'
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

const { isWindows } = useRendererPlatform()
const route = useRoute()
const targetSection = computed(() =>
  typeof route.query.section === 'string' ? route.query.section : ''
)
const showAdvancedSettings = computed(() =>
  Boolean(appSetting?.dev?.advancedSettings || targetSection.value === 'file-index')
)

watch(
  targetSection,
  async (section) => {
    if (!section) return

    await nextTick()
    document.querySelector(`[data-settings-section="${section}"]`)?.scrollIntoView({
      block: 'start',
      behavior: 'smooth'
    })
  },
  { immediate: true }
)
</script>
<template>
  <ViewTemplate title="$I18n:router.appSettings">
    <div class="AppSettings-Container">
      <SettingHeader />

      <SettingUser />

      <SettingLanguage />

      <SettingSetup />

      <SettingTools />

      <SettingAssistant />

      <div data-settings-section="file-index">
        <SettingFileIndex
          v-if="showAdvancedSettings"
          :force-advanced-settings="targetSection === 'file-index'"
        />
      </div>

      <div data-settings-section="everything">
        <SettingEverything v-if="isWindows" />
      </div>

      <SettingDownload v-if="showAdvancedSettings" />

      <SettingUpdate />

      <SettingSentry v-if="showAdvancedSettings" />

      <SettingStorage v-if="showAdvancedSettings" />

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

    background-color: var(--color, var(--tx-color-info));
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
  border: 1px solid var(--tx-border-color);
}

.AppSettings-Container {
  position: relative;

  min-height: 100%;
  padding-bottom: 24px;
  width: 100%;
}
</style>
