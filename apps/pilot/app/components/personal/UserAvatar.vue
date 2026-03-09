<script setup lang="ts">
import { globalOptions } from '~/constants'

const props = defineProps<{
  avatar: string
}>()

const _avatar = computed(() => {
  if (!props.avatar)
    return ''

  if (props.avatar.startsWith('http'))
    return props.avatar

  return globalOptions.getEndsUrl() + props.avatar
})
</script>

<template>
  <el-avatar :src="_avatar" />
</template>

<style lang="scss">
.el-avatar {
  img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }
}
</style>
