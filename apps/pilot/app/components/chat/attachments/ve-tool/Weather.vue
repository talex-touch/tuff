<script setup lang="ts">
import type { IInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'

const props = defineProps<{
  data: any
  value: any
}>()
</script>

<template>
  <div class="Weather">
    {{ value.data }}
    <!-- <div class="Weather-Inner" /> -->
  </div>
</template>

<style lang="scss" scoped>
.Weather {
  &-Inner {
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;
  }

  position: relative;

  // width: 20rem;
  // height: 20rem;

  overflow: hidden;
  border-radius: 8px;
}
</style>
