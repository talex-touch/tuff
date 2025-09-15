<script setup lang="ts" name="SettingUser">
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import TBlockSwitch from '~/components/base/switch/TBlockSwitch.vue'

const router = useRouter()
const { t } = useI18n()
</script>

<template>
  <t-block-switch
    v-wave
    guidance
    :title="t('settingStorage.title')"
    :description="t('settingStorage.description')"
    icon="file-2"
    @click="router.push('/setting/storage')"
  />
</template>
