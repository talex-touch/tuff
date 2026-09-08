<script lang="ts" setup>
defineProps<{
  name:
    | 'arrow-left'
    | 'chevron'
    | 'clipboard'
    | 'close'
    | 'eye'
    | 'folder'
    | 'image'
    | 'key'
    | 'layers'
    | 'link'
    | 'loader'
    | 'palette'
    | 'star'
    | 'terminal'
    | 'text'
    | 'trash'
    | 'video'
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

    <template v-else-if="name === 'image'">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" />
      <path d="M9 10.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0" />
      <path d="m4.5 16.5 4-4 5 5" />
      <path d="m13.5 14.5 2.5-2.5 3.5 3.5" />
    </template>

    <template v-else-if="name === 'eye'">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12" />
      <path d="M14.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0" />
    </template>

    <template v-else-if="name === 'chevron'">
      <path d="m6 9 6 6 6-6" />
    </template>

    <template v-else-if="name === 'close'">
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </template>

    <template v-else-if="name === 'star'">
      <path d="m12 3.5 2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.65l5.9-.85z" />
    </template>

    <template v-else-if="name === 'trash'">
      <path d="M4 7h16" />
      <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" />
      <path d="M10.5 11v6" />
      <path d="M13.5 11v6" />
    </template>

    <template v-else-if="name === 'layers'">
      <path d="m12 3 8.5 4.5L12 12 3.5 7.5z" />
      <path d="m3.5 12 8.5 4.5 8.5-4.5" />
      <path d="m3.5 16.5 8.5 4.5 8.5-4.5" />
    </template>

    <template v-else-if="name === 'link'">
      <path d="M10 13.5a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.3 1.3" />
      <path d="M14 10.5a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.3-1.3" />
    </template>

    <template v-else-if="name === 'video'">
      <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 13 18H5a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="m14.5 13 6 3.5v-9l-6 3.5z" />
    </template>

    <template v-else-if="name === 'palette'">
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7h1.6a4.4 4.4 0 0 0 4.4-4.4c0-3.7-3.8-6.8-8.5-6.8" />
      <path d="M7.8 10.2a1 1 0 1 1-2 0 1 1 0 0 1 2 0" />
      <path d="M10.8 6.9a1 1 0 1 1-2 0 1 1 0 0 1 2 0" />
      <path d="M15.4 7.4a1 1 0 1 1-2 0 1 1 0 0 1 2 0" />
    </template>

    <template v-else-if="name === 'terminal'">
      <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h14a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="m7.5 9.5 2.5 2.5-2.5 2.5" />
      <path d="M12.5 15h4" />
    </template>

    <template v-else-if="name === 'key'">
      <path d="M9.5 14.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7" />
      <path d="M12.8 9.8H20" />
      <path d="M17.5 9.8v3" />
      <path d="M20 9.8v2" />
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
