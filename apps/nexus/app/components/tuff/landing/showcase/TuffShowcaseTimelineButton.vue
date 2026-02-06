<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  label: string
  active?: boolean
  progress?: number
}>(), {
  active: false,
  progress: 0,
})

const emit = defineEmits<{
  (e: 'select'): void
}>()

const progressValue = computed(() => {
  if (!props.active)
    return 0
  return Math.min(Math.max(props.progress ?? 0, 0), 1)
})
</script>

<template>
  <TxButton
    variant="bare"
    native-type="button"
    class="tuff-showcase-displayer__timeline-button"
    :class="{ 'is-active': active }"
    :style="{ '--showcase-progress': `${progressValue * 100}%` }"
    :aria-pressed="active"
    @click="emit('select')"
  >
    <span class="tuff-showcase-displayer__timeline-label">
      {{ label }}
    </span>
    <div class="tuff-showcase-displayer__timeline-button-indicator" />
  </TxButton>
</template>

<style scoped>
.tuff-showcase-displayer__timeline-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  padding: 0.75rem 2.5rem;
  border-radius: 16px;
  background: #161616;
  border: none;
  color: #eee;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: none;
  font-weight: 500;
  cursor: pointer;
  transition: all cubic-bezier(0.22, 0.61, 0.36, 1);
}

.tuff-showcase-displayer__timeline-button::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -2;
  border-radius: inherit;
  background: linear-gradient(90deg, #ff6bcb, #ffa63f, #fffb7d, #38f9d7, #4776e6, #b967ff, #ff6bcb);
  opacity: 0;
  filter: blur(12px);
  transition: opacity 320ms ease;
}

.tuff-showcase-displayer__timeline-button-indicator {
  position: absolute;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;
}

.tuff-showcase-displayer__timeline-button-indicator::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0.25;
  width: var(--showcase-progress, 0);
  background: #fff;
}

.tuff-showcase-displayer__timeline-button:hover,
.tuff-showcase-displayer__timeline-button:focus-visible {
  color: #ddd;
  background: #212121;
  outline: none;
  transform: translate3d(0, 1px, 0);
}


.tuff-showcase-displayer__timeline-button.is-active {
  color: #fff;
  background: #121212a0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
}

.tuff-showcase-displayer__timeline-button.is-active::before {
  opacity: 0.5;
  animation: showcase-timeline-button-glow 1.5s linear both infinite;
}

@keyframes showcase-timeline-button-glow {
  0%, 100% {
    opacity: 0.5;
  }
  50% {
    opacity: 0.25;
  }
}

.tuff-showcase-displayer__timeline-label {
  white-space: nowrap;
}

@media (max-width: 820px) {
  .tuff-showcase-displayer__timeline-button {
    width: 100%;
    text-align: center;
  }
}

@media (max-width: 520px) {
  .tuff-showcase-displayer__timeline-button {
    justify-content: center;
  }

  .tuff-showcase-displayer__timeline-label {
    white-space: normal;
  }
}
</style>
