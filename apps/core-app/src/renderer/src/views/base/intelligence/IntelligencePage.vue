<template>
  <ViewTemplate title="Intelligence">
    <div class="intelligence-container">
      <!-- Hero Section -->
      <IntelligenceHeader />

      <!-- Configuration Sections -->
      <IntelligenceChannels />

      <IntelligenceCapabilities />

      <IntelligencePrompts />

      <IntelligenceFuture />
    </div>
  </ViewTemplate>
</template>

<script lang="ts" name="IntelligencePage" setup>
import ViewTemplate from '~/components/base/template/ViewTemplate.vue'
import IntelligenceHeader from '~/components/intelligence/sections/IntelligenceHeader.vue'
import IntelligenceChannels from '~/components/intelligence/sections/IntelligenceChannels.vue'
import IntelligenceCapabilities from '~/components/intelligence/sections/IntelligenceCapabilities.vue'
import IntelligencePrompts from '~/components/intelligence/sections/IntelligencePrompts.vue'
import IntelligenceFuture from '~/components/intelligence/sections/IntelligenceFuture.vue'
</script>

<style lang="scss" scoped>
.intelligence-container {
  position: relative;
  height: 100%;
  width: 100%;
}
</style>
