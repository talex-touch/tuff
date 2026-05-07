<script setup lang="ts">
import { reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { getPreloadProcessInfo } from '~/modules/preload/process-info'

const { t } = useI18n()

const versions = reactive({ ...(getPreloadProcessInfo()?.versions ?? {}) })
</script>

<template>
  <ul class="versions">
    <li class="electron-version">{{ t('versions.electron') }} v{{ versions.electron }}</li>
    <li class="chrome-version">{{ t('versions.chrome') }} v{{ versions.chrome }}</li>
    <li class="node-version">{{ t('versions.node') }} v{{ versions.node }}</li>
  </ul>
</template>
