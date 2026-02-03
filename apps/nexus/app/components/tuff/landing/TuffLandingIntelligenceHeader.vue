<script setup lang="ts">
import TuffLandingIntelligenceTitle from './TuffLandingIntelligenceTitle.vue'

withDefaults(defineProps<{
  title: string
  description: string
  betaLabel?: string
}>(), {
  betaLabel: 'Beta',
})
</script>

<template>
  <div class="TuffLandingIntelligenceHeader">
    <div class="TuffLandingIntelligenceHeader-Glow" />

    <div class="TuffLandingIntelligenceHeader-Main">
      <h1>
        <TuffLandingIntelligenceTitle :title="title" :beta-label="betaLabel" />
      </h1>

      <div class="header-text">
        <p>{{ description }}</p>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.TuffLandingIntelligenceHeader {
  &-Main {
    position: absolute;
    display: flex;

    inset: 0;

    align-items: center;
    flex-direction: column;
    justify-content: center;

    h1 {
      margin: 0;
      font-weight: 600;
      font-size: 32px;
      text-align: center;
    }

    p {
      color: #e0e0e0ea;
      text-shadow: 1px 1px 2px rgba(200, 200, 200, 0.5);
      text-align: center;
    }
  }

  position: relative;
  margin: 0.5rem 0;
  width: 100%;
  height: 180px;
  clear: both;
  overflow: hidden;
  user-select: none;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);

  &::after {
    z-index: -1;
    content: '';
    position: absolute;

    inset: 0;

    background-image: url('~/images/assets/intelligence.png');
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }
}

.TuffLandingIntelligenceHeader-Glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-style: solid;
  border-image-slice: 1;
  border-image-source: linear-gradient(var(--angle), #0894ff 0%, #c959dd 34%, #ff2e54 68%, #ff9004);
  animation: spin 10000ms infinite linear;
  border-width: 24px;
  filter: blur(7px);
  margin: 7px * -2;
  mix-blend-mode: hard-light;
}

/* Required for interpolating gradient angles in the animation. */
@property --angle {
  inherits: false;
  initial-value: 0deg;
  syntax: '<angle>';
}

@keyframes spin {
  to {
    --angle: 360deg;
  }
}
</style>
