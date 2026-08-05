<script lang="ts" name="SettingAppearancePage" setup>
import ThemeStyle from '~/views/base/styles/ThemeStyle.vue'

/**
 * Mounted full-bleed rather than inside `SettingsPage`: `ThemeStyle` is a complete page with
 * its own heading, scroll container and nested `/styles/theme` child route. Wrapping it would
 * double the chrome and break that child route.
 */
</script>

<template>
  <ThemeStyle />
</template>
