<script setup lang="ts">
import { resolveComponent } from 'vue'

const shouldRenderPwaManifest = import.meta.env.PROD || import.meta.env.VITE_PLUGIN_PWA === 'true'
const pwaManifestComponent = shouldRenderPwaManifest ? resolveComponent('VitePwaManifest') : null
</script>

<template>
  <component
    :is="pwaManifestComponent"
    v-if="pwaManifestComponent"
  />
</template>
