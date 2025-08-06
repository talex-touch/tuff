<template>
  <i class="remix" :class="`i-ri-${name}${style ? `-${style}` : ''}`"></i>
</template>

<script lang="ts" name="RemixIcon" setup>
defineProps({
  name: {
    type: String,
    required: true
  },
  style: {
    type: String,
    validator(value: string) {
      return ['line', 'fill', ''].includes(value)
    }
  }
})
</script>

<style scoped>
.remix {
  font-size: 1.25rem;

  width: 1em;
  height: 1em;
}
</style>
