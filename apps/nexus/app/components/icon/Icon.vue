<script setup lang="ts">
withDefaults(defineProps<{
  name?: string
}>(), {
  name: '',
})
</script>

<template>
  <div
    class="Icon flex items-center justify-center"
    :attrs="$attrs"
  >
    <div :class="name" />
  </div>
</template>
