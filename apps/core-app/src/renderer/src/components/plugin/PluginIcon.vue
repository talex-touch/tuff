<script lang="ts" name="PluginIcon" setup>
import TuffIcon from '~/components/base/TuffIcon.vue'
import type { IPluginIcon } from '@talex-touch/utils'

defineProps<{
  icon: IPluginIcon
  alt: string
}>()
</script>

<template>
  <TuffIcon :icon="icon" :alt="alt" />
</template>
