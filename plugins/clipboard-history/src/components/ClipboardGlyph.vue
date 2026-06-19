<script lang="ts" setup>
defineProps<{
  name: 'arrow-left' | 'clipboard' | 'folder' | 'loader' | 'text'
}>()
</script>

<template>
  <svg
    class="ClipboardGlyph"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="1.8"
    viewBox="0 0 24 24"
  >
    <template v-if="name === 'loader'">
      <path d="M12 3a9 9 0 1 1-6.36 2.64" />
      <path d="M5.64 5.64V2.8" />
      <path d="M5.64 5.64H2.8" />
    </template>

    <template v-else-if="name === 'clipboard'">
      <path d="M9 5h6" />
      <path d="M9 4.5A2.5 2.5 0 0 1 11.5 2h1A2.5 2.5 0 0 1 15 4.5V6H9z" />
      <path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <path d="M8 12h8" />
      <path d="M8 16h6" />
    </template>

    <template v-else-if="name === 'folder'">
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2h7A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
    </template>

    <template v-else-if="name === 'text'">
      <path d="M5 6h14" />
      <path d="M12 6v12" />
      <path d="M8.5 18h7" />
    </template>

    <template v-else>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </template>
  </svg>
</template>

<style scoped>
.ClipboardGlyph {
  width: 1em;
  height: 1em;
  display: block;
  flex: 0 0 auto;
}
</style>
