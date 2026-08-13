<script lang="ts" name="SettingAboutPage" setup>
import { defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsPage from '~/components/settings/SettingsPage.vue'

/**
 * No identity hero here: this page already states the version, build and runtime in full, so the
 * card only repeated it. The hero stays on 总览, which is the landing page it belongs to.
 */
const SettingAbout = defineAsyncComponent(() => import('../SettingAbout.vue'))

const { t } = useI18n()
</script>

<template>
  <SettingsPage :title="t('settingsNav.category.about')">
    <SettingAbout />
  </SettingsPage>
</template>
