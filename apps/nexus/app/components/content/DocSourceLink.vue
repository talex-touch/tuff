<script setup lang="ts">
import { useAttrs } from 'vue'
import TuffDocSourceLink from '~/components/content/TuffDocSourceLink.vue'

const props = withDefaults(defineProps<{
  label?: string
  path?: string
}>(), {
  path: '',
})

const attrs = useAttrs()
</script>

<template>
  <TuffDocSourceLink :label="props.label || undefined" :path="props.path" v-bind="attrs" />
</template>
