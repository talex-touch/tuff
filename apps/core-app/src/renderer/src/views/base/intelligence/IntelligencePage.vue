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
import IntelligenceHeader from './components/IntelligenceHeader.vue'
import IntelligenceChannels from './components/IntelligenceChannels.vue'
import IntelligenceCapabilities from './components/IntelligenceCapabilities.vue'
import IntelligencePrompts from './components/IntelligencePrompts.vue'
import IntelligenceFuture from './components/IntelligenceFuture.vue'
</script>

<style lang="scss" scoped>
.intelligence-container {
  position: relative;
  height: 100%;
  width: 100%;
}
</style>
