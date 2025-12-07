<template>
  <component :is="as" class="gradient-border" :style="rootStyle"></component>
</template>

<script lang="ts">
import { defineComponent, computed, PropType, CSSProperties } from 'vue'

/**
 * GradientBorder
 *
 * A wrapper component that renders a flowing, multi-color gradient border
 * around its content. The border automatically adapts to the size of the
 * slotted content and uses absolute positioning internally to avoid
 * affecting layout.
 */
export default defineComponent({
  name: 'GradientBorder',
  props: {
    /**
     * The HTML tag that should be used for the root element.
     * Defaults to "div".
     */
    as: {
      type: String as PropType<keyof HTMLElementTagNameMap | string>,
      default: 'div'
    },

    /**
     * Width of the gradient border.
     * You can pass any valid CSS length (e.g. "1px", "2px", "0.1rem").
     * Defaults to "1px".
     */
    borderWidth: {
      type: [String, Number] as PropType<string | number>,
      default: '5px'
    },

    /**
     * Border radius applied to the outer border and inner content wrapper.
     * You can pass any valid CSS length or percentage (e.g. "8px", "0.5rem", "999px").
     * Defaults to "8px".
     */
    borderRadius: {
      type: [String, Number] as PropType<string | number>,
      default: '20px'
    },

    /**
     * Padding between the border and the slotted content.
     * This padding is applied to the inner wrapper, not the root element.
     * Defaults to "12px".
     */
    padding: {
      type: [String, Number] as PropType<string | number>,
      default: '12px'
    },

    /**
     * Duration of one full gradient rotation in seconds.
     * Smaller values will make the animation faster.
     * Defaults to 4 (seconds).
     */
    animationDuration: {
      type: Number,
      default: 4
    }
  },
  setup(props) {
    const toCssUnit = (value: string | number): string =>
      typeof value === 'number' ? `${value}px` : value

    const rootStyle = computed<CSSProperties>(
      () =>
        ({
          '--gradient-border-width': toCssUnit(props.borderWidth),
          '--gradient-border-radius': toCssUnit(props.borderRadius),
          '--gradient-inner-padding': toCssUnit(props.padding),
          '--gradient-duration': `${props.animationDuration}s`
        }) as CSSProperties
    )

    return {
      rootStyle
    }
  }
})
</script>

<style scoped>
/* Register a typed custom property for the angle,
   so it can be animated in modern browsers. */
@property --angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

.gradient-border {
  position: absolute;

  inset: 0;

  overflow: hidden;
  border-radius: var(--gradient-border-radius);
}

/* The animated border layer */
.gradient-border::before {
  content: '';
  position: absolute;

  inset: 0;

  opacity: 0.75;
  filter: blur(var(--gradient-border-width));

  border-style: solid;
  border-width: var(--gradient-border-width);
  border-radius: var(--gradient-border-radius);
  border-image-slice: 1;
  border-image-source: linear-gradient(
    var(--angle),
    #0894ff 0%,
    #c959dd 34%,
    #ff2e54 68%,
    #ff9004 100%
  );
  pointer-events: none;
  z-index: 0;

  animation: rotate-angle var(--gradient-duration) linear infinite;
}

/* Animate the CSS custom property --angle 0deg -> 360deg */
@keyframes rotate-angle {
  from {
    --angle: 0deg;
  }
  to {
    --angle: 360deg;
  }
}
</style>
