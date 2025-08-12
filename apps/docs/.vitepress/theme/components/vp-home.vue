<script lang="ts" setup>
import { onMounted } from 'vue';
import TouchBanner from './base/TouchBanner.vue';
import TouchText from './base/TouchText.vue';
import TouchFeatures from './base/TouchFeatures.vue';
import TouchButton from './base/TouchButton.vue';
import CoreBoxMockup from './core-box/CoreBoxMockup.vue';
import PluginExtensionSection from './PluginExtensionSection.vue';
import PioneerTestingSection from './PioneerTestingSection.vue';

onMounted(() => {
  const pageHeight = document.documentElement.clientHeight;

  document.documentElement.style.setProperty('--vh', `${pageHeight}px`);
})
</script>

<template>
  <div class="Home">
    <TouchBanner style="height: 100vh">
      <template #core-box>
        <CoreBoxMockup />
      </template>

      <template #center>
        <TouchText />
        <p style="color: #eee">A strong adaptation more platform all-tool program.</p>

        <div style="margin-bottom: -4rem">
          <TouchButton>
            Download <span style="font-weight: bold;">BETA</span> version
          </TouchButton>
        </div>
      </template>
    </TouchBanner>

    <TouchFeatures />

    <PluginExtensionSection />

    <PioneerTestingSection />
  </div>
</template>

<style lang="scss" scoped>
.Home {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100%;

  color: white;
}

.touch-text {
  text-shadow:
      0 0 10px rgba(255, 255, 255, 0.5),
      0 0 20px rgba(255, 255, 255, 0.3),
      0 0 30px rgba(255, 255, 255, 0.2);
  animation: textGlow 3s ease-in-out infinite alternate;
}

@keyframes textGlow {
  from {
    text-shadow:
        0 0 10px rgba(255, 255, 255, 0.5),
        0 0 20px rgba(255, 255, 255, 0.3),
        0 0 30px rgba(255, 255, 255, 0.2);
  }
  to {
    text-shadow:
        0 0 15px rgba(255, 255, 255, 0.6),
        0 0 25px rgba(255, 255, 255, 0.4),
        0 0 35px rgba(255, 255, 255, 0.3);
  }
}
</style>

<style lang="scss">
.VPContent.is-home {
  display: flex;
  padding: 0 !important;
  height: 100%;

  .VPHome {
    & > div {
      display: flex;
      flex-grow: 1;
      & > div {
        flex-grow: 1;
      }
    }
    flex-grow: 1;
    padding: 0;
    width: 100%;
    height: 100%;
    min-width: 100%;
    min-height: 100%;
  }
}
</style>
