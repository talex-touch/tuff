<script lang="ts" name="SettingStoragePage" setup>
import { useI18n } from 'vue-i18n'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import Storagable from '~/views/storage/Storagable.vue'

/**
 * Not a transit page: the storage report renders here directly.
 *
 * An earlier revision pointed the category route straight at `Storagable`, which removed the
 * extra click but also skipped `SettingsPage` — so this one body carried its own heading and
 * scroller while every other category used the shared ones. `embedded` drops that inner chrome.
 */
const { t } = useI18n()
</script>

<template>
  <SettingsPage :title="t('settingsNav.category.storage')">
    <Storagable embedded />
  </SettingsPage>
</template>
