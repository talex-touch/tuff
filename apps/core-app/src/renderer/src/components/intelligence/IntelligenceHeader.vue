<script setup name="IntelligenceHeader" lang="ts">
import { useI18n } from 'vue-i18n'
// import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'

const { t } = useI18n()
// const { providers } = useIntelligenceManager()

// const providerCount = computed(() => (providers.value ? providers.value.length : 0))
// const capabilityCount = computed(() => Object.keys(capabilities.value || {}).length)
// const totalChannels = computed(() => providerCount.value)
</script>

<template>
  <div class="IntelligenceHeader">
    <div class="IntelligenceHeader-Glow"></div>

    <div class="IntelligenceHeader-Main">
      <h1>Tuff Intelligence&nbsp;<tuff-beta-tag /></h1>

      <div class="header-text">
        <p>{{ t('settings.intelligence.pageDesc') }}</p>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.IntelligenceHeader {
  &-Main {
    position: absolute;
    display: flex;

    inset: 0;

    align-items: center;
    flex-direction: column;
    justify-content: center;

    h1 {
      display: inline;
      background: #1d1d1f;
      background-clip: text;
      -webkit-text-fill-color: rgba(0, 0, 0, 0);
      box-decoration-break: clone;
      background-image: linear-gradient(108deg, #0894ff, #c959dd 34%, #ff2e54 68%, #ff9004);
      font-weight: 600;
      font-size: 32px;
    }

    p {
      color: #e0e0e0ea;
      text-shadow: 1px 1px 2px rgba(200, 200, 200, 0.5);
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
  border: 1px solid var(--el-border-color);

  &::after {
    z-index: -1;
    content: '';
    position: absolute;

    inset: 0;

    background-image: url('~/assets/bg/intelligence.png');
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }
}

@keyframes header-breathing {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0);
  }

  30%,
  50% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }

  50% {
    opacity: 0.8;
    transform: translate(-50%, -50%) scale(0.8);
  }

  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.5);
  }
}

@keyframes waving {
  from {
    background-position: 0;
  }

  to {
    background-position: 200%;
  }
}

.IntelligenceHeader-Glow {
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

/**
 * `@property` is required for the animation to work.
 * Without it, the angle values won’t interpolate properly.
 *
 * @see https://dev.to/afif/we-can-finally-animate-css-gradient-kdk
 */
@property --angle {
  inherits: false;
  initial-value: 0deg;
  syntax: '<angle>';
}

/**
 * To animate the gradient, we set the custom property to 1 full
 * rotation. The animation starts at the default value of `0deg`.
 */
@keyframes spin {
  to {
    --angle: 360deg;
  }
}
</style>
