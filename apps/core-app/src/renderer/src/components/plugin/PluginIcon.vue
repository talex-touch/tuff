<script lang="ts" name="PluginIcon" setup>
import TuffIcon from '~/components/base/TuffIcon.vue'
import type { ITuffIcon } from '@talex-touch/utils'

defineProps<{
  icon: ITuffIcon
  alt: string
}>()
</script>

<template>
  <TuffIcon :icon="icon" :alt="alt" />
</template>
