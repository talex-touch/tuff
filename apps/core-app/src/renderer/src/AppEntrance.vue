<script name="AppEntrance" setup lang="ts">
import { isCoreBox } from '@talex-touch/utils/renderer'
import CoreBox from './views/box/CoreBox.vue'
</script>

<template>
  <template v-if="isCoreBox()">
    <CoreBox />
  </template>
  <template v-else>
    <slot />
  </template>
</template>
