<script setup lang="ts">
const props = withDefaults(defineProps<{
  id?: string
  tag?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
}>(), {
  id: '',
  tag: 'h2',
})
</script>

<template>
  <component :is="props.tag" :id="props.id || undefined">
    <NuxtLink v-if="props.id" :href="`#${props.id}`">
      <slot />
    </NuxtLink>
    <slot v-else />
  </component>
</template>
