<script lang="ts" name="ShellTrafficLights" setup>
import { useRendererPlatform } from '~/modules/platform/renderer-platform'

/**
 * Reserves the space the native macOS window buttons are drawn into.
 *
 * The window is created with `titleBarStyle: 'hidden'` and a `trafficLightPosition`
 * matching this box, so nothing is rendered here — it only keeps sidebar content from
 * sliding underneath. Windows and Linux have no native buttons in this corner (they use
 * `titleBarOverlay` on the right side of the top bar), so the block collapses entirely.
 */
const { isMac } = useRendererPlatform()
</script>

<template>
  <div v-if="isMac" class="ShellTrafficLights" aria-hidden="true" />
</template>

<style lang="scss" scoped>
.ShellTrafficLights {
  flex: 0 0 auto;
  width: 64px;
  height: 20px;
  -webkit-app-region: drag;
}
</style>
