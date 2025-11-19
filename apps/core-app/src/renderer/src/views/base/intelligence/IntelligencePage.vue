<script lang="ts" name="IntelligencePage" setup>
import ViewTemplate from '~/components/base/template/ViewTemplate.vue'
import IntelligenceCapabilities from '~/components/intelligence/IntelligenceCapabilities.vue'
import IntelligenceChannels from '~/components/intelligence/IntelligenceChannels.vue'
import IntelligenceFuture from '~/components/intelligence/IntelligenceFuture.vue'
import IntelligenceHeader from '~/components/intelligence/IntelligenceHeader.vue'
import IntelligencePrompts from '~/components/intelligence/IntelligencePrompts.vue'
</script>

<template>
  <ViewTemplate title="Intelligence">
    <IntelligenceHeader />

    <IntelligenceChannels />

    <IntelligenceCapabilities />

    <IntelligencePrompts />

    <IntelligenceFuture />
  </ViewTemplate>
</template>
