<script setup lang="ts">
import AppIcon from '~/assets/logo.svg'
</script>

<template>
  <div class="PrefixIcon transition-cubic">
    <img class="transition-cubic" :src="AppIcon" />
  </div>
</template>

<style lang="scss" scoped>
.PrefixIcon {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
