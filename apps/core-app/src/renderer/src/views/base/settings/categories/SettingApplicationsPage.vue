<script lang="ts" name="SettingApplicationsPage" setup>
import { useI18n } from 'vue-i18n'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import ApplicationIndex from '../../application/ApplicationIndex.vue'

const { t } = useI18n()
</script>

<template>
  <!--
    `fill` hands the column a definite height: the split browser sizes its two panes against it,
    and a `height: 100%` child of a scrolling column resolves to nothing.
  -->
  <SettingsPage :title="t('settingsNav.category.applications')" fill>
    <ApplicationIndex />
  </SettingsPage>
</template>
