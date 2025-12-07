<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { computed } from 'vue'

interface AiGlowBorderProps {
  /** Border radius in pixels */
  borderRadius?: number
  /** Border width in pixels */
  borderWidth?: number
  /** Animation duration in seconds */
  duration?: number
  /** Gradient colors array */
  colors?: string[]
  /** Whether animation is active */
  animated?: boolean
  /** Blur amount for the glow effect */
  glowBlur?: number
  /** Glow intensity (0-1) */
  glowIntensity?: number
  /** Background color inside the border */
  background?: string
  /** Custom class for the container */
  className?: string
  /** Custom styles */
  style?: CSSProperties
}

const props = withDefaults(defineProps<AiGlowBorderProps>(), {
  borderRadius: 12,
  borderWidth: 2,
  duration: 3,
  colors: () => ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#ff6b6b'],
  animated: true,
  glowBlur: 12,
  glowIntensity: 0.6,
  background: 'var(--el-bg-color)',
  className: ''
})

const gradientColors = computed(() => props.colors.join(', '))

const cssVars = computed(() => ({
  '--ai-border-radius': `${props.borderRadius}px`,
  '--ai-border-width': `${props.borderWidth}px`,
  '--ai-duration': `${props.duration}s`,
  '--ai-gradient-colors': gradientColors.value,
  '--ai-glow-blur': `${props.glowBlur}px`,
  '--ai-glow-intensity': props.glowIntensity,
  '--ai-background': props.background
}))
</script>

<template>
  <div
    class="AiGlowBorder"
    :class="[{ animated }, className]"
    :style="[cssVars, style]"
  >
    <div class="AiGlowBorder-wrapper">
      <div class="AiGlowBorder-glow" />
      <div class="AiGlowBorder-border" />
    </div>
    <div class="AiGlowBorder-content">
      <slot />
    </div>
  </div>
</template>

<style lang="scss">
.AiGlowBorder {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: var(--ai-border-radius);

  &-wrapper {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    overflow: hidden;
  }

  // Rotating gradient layer
  &-glow,
  &-border {
    position: absolute;
    // Make the gradient larger than container to ensure full coverage during rotation
    inset: -50%;
    background: conic-gradient(from 0deg, var(--ai-gradient-colors));
  }

  // Glow layer (with blur)
  &-glow {
    filter: blur(var(--ai-glow-blur));
    opacity: var(--ai-glow-intensity);
  }

  // Border layer (sharp)
  &-border {
    opacity: 1;
  }

  // Content layer (with mask to create border effect)
  &-content {
    position: absolute;
    inset: var(--ai-border-width);
    border-radius: calc(var(--ai-border-radius) - var(--ai-border-width));
    background: var(--ai-background);
    overflow: hidden;
    z-index: 1;
  }

  // Animation
  &.animated {
    .AiGlowBorder-glow,
    .AiGlowBorder-border {
      animation: ai-glow-spin var(--ai-duration) linear infinite;
    }
  }
}

@keyframes ai-glow-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
