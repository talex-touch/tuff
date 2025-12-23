<script setup lang="ts">
import { computed } from 'vue'

defineOptions({
  name: 'TxSpinner',
})

const props = defineProps({
  size: {
    type: Number,
    default: 16,
  },
  strokeWidth: {
    type: Number,
    default: 2,
  },
  fallback: {
    type: Boolean,
    default: false,
  },
  visible: {
    type: Boolean,
    default: true,
  },
})

const styleVars = computed(() => ({
  '--tx-spinner-size': `${props.size}px`,
  '--tx-spinner-stroke': String(props.strokeWidth),
}))
</script>

<template>
  <Transition name="tx-spinner-visibility" appear>
    <span
      v-if="visible"
      class="tx-spinner"
      :style="styleVars"
      aria-busy="true"
      aria-live="polite"
    >
      <svg v-if="fallback" class="tx-spinner__svg" viewBox="0 0 24 24" :width="size" :height="size">
        <circle
          class="tx-spinner__circle"
          cx="12"
          cy="12"
          r="10"
          fill="none"
          stroke="currentColor"
          :stroke-width="strokeWidth"
          stroke-linecap="round"
          stroke-dasharray="31.416"
          stroke-dashoffset="31.416"
        />
      </svg>
      <div class="tx-spinner-container" v-else>
        <div class="tx-spinner-container-ball"></div>
        <div class="tx-spinner-container-float"></div>
      </div>
    </span>
  </Transition>
</template>

<style lang="scss">
.tx-spinner-container {
  position: relative;
  display: block;
  width: var(--tx-spinner-size, 16px);
  height: var(--tx-spinner-size, 16px);
  border: calc(var(--tx-spinner-stroke, 2) * 1px) solid currentColor;
  border-radius: 50%;
}

.tx-spinner-container-float {
  position: absolute;

  top: 0%;
  left: 50%;

  width: 25%;
  height: 25%;

  min-width: 6px;
  min-height: 6px;

  border-radius: 50%;
  background-color: currentColor;
  transform: translate(-50%, -50%);
}

@keyframes tx-spinner-float-rotate {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.tx-spinner-container-ball {
  position: absolute;

  top: 50%;
  left: 50%;

  width: 100%;
  height: 100%;

  background-color: currentColor;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  animation: tx-spinner-ball-move 0.85s ease-out infinite;
}

@keyframes tx-spinner-ball-move {
  0% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(0);
  }
  100% {
    opacity: 0.45;
    transform: translate(-50%, -50%) scale(1);
  }
}

@keyframes tx-spinner-rotate {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes tx-spinner-dash {
  0% {
    stroke-dashoffset: 31.416;
  }
  50% {
    stroke-dashoffset: 0;
  }
  100% {
    stroke-dashoffset: -31.416;
  }
}

.tx-spinner {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--tx-spinner-size, 16px);
  height: var(--tx-spinner-size, 16px);
  color: var(--tx-text-color-secondary, #909399);

  scale: 1;
  transition: opacity 0.18s cubic-bezier(0.2, 0, 0, 1), filter 0.18s cubic-bezier(0.2, 0, 0, 1), scale 0.18s cubic-bezier(0.2, 0, 0, 1);
  will-change: opacity, filter, scale;

  animation: tx-spinner-float-rotate 0.85s linear infinite;

  &__svg {
    width: 100%;
    height: 100%;
    animation: tx-spinner-rotate 1s linear infinite;
  }

  &__circle {
    animation: tx-spinner-dash 1.5s ease-in-out infinite;
  }
}

.tx-spinner-visibility-enter-from,
.tx-spinner-visibility-leave-to {
  opacity: 0;
  filter: blur(4px);
  scale: 0.86;
}
</style>
