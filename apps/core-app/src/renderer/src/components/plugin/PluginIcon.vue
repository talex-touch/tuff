<script lang="ts" name="PluginIcon" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import TuffIcon from '~/components/base/TuffIcon.vue'

defineProps<{
  icon: ITuffIcon
  alt: string
}>()
</script>

<template>
  <TuffIcon :icon="icon" :alt="alt" />
</template>
