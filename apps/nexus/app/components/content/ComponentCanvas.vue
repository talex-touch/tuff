<script setup lang="ts">
import { useAttrs } from 'vue'
import TuffComponentCanvas from '~/components/content/TuffComponentCanvas.vue'

const props = withDefaults(defineProps<{
  name?: string
}>(), {
  name: '',
})
const attrs = useAttrs()
</script>

<template>
  <TuffComponentCanvas :name="props.name" v-bind="attrs">
    <slot />
  </TuffComponentCanvas>
</template>
