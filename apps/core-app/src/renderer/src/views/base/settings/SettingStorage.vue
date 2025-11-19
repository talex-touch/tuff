<script setup lang="ts" name="SettingStorage">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'

const router = useRouter()
const { t } = useI18n()
</script>

<template>
  <TuffBlockSwitch
    v-wave
    guidance
    :model-value="false"
    :title="t('settingStorage.title')"
    :description="t('settingStorage.description')"
    default-icon="i-carbon-folder"
    active-icon="i-carbon-folder-open"
    @click="router.push('/setting/storage')"
  />
</template>
