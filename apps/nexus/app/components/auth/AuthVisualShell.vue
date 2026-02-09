<script setup lang="ts">
import { computed } from 'vue'
import TouchAurora from '~/components/tuff/background/TouchAurora.vue'

const props = withDefaults(defineProps<{
  loading?: boolean
  blockText?: string | null
}>(), {
  loading: false,
  blockText: '',
})

const blockMessage = computed(() => props.blockText?.trim() || '')
</script>

<template>
  <div class="dark auth-visual-shell relative min-h-screen overflow-hidden bg-[#08080d] text-white" :class="{ 'is-loading': loading }">
    <div class="pointer-events-none absolute inset-0">
      <div class="auth-glow auth-glow--top absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(120,90,255,0.18),_transparent_55%)]" />
      <div class="auth-glow auth-glow--left absolute -left-40 top-[18%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(255,120,155,0.18),_transparent_70%)] blur-3xl" />
      <div class="auth-glow auth-glow--right absolute -right-48 bottom-[8%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_rgba(88,190,255,0.2),_transparent_70%)] blur-3xl" />
      <TouchAurora
        :color-stops="['#574BDD', '#8727CE', '#057CCF']"
        :amplitude="1.0"
        :blend="0.5"
        :speed="1.0"
        :intensity="1.0"
        class="op-10 -scale-100"
      />
    </div>

    <div
      v-if="blockMessage"
      class="auth-session-lock"
      aria-live="polite"
      aria-busy="true"
    >
      <p class="auth-session-lock__text">
        {{ blockMessage }}
      </p>
    </div>

    <slot name="header" />

    <main class="auth-main">
      <slot />
    </main>

    <slot name="footer" />
  </div>
</template>

<style scoped>
.auth-glow {
  animation: auth-float 18s ease-in-out infinite;
  animation-play-state: paused;
}

.auth-glow--left {
  animation-duration: 22s;
}

.auth-glow--right {
  animation-duration: 26s;
}

.auth-glow--top {
  animation-duration: 20s;
}

.is-loading .auth-glow {
  animation-play-state: running;
}

.auth-session-lock {
  position: absolute;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 24% 18%, rgba(255, 255, 255, 0.16), transparent 36%),
    radial-gradient(circle at 72% 72%, rgba(148, 196, 255, 0.2), transparent 42%),
    rgba(8, 8, 13, 0.64);
  backdrop-filter: blur(18px) saturate(130%);
  -webkit-backdrop-filter: blur(18px) saturate(130%);
  pointer-events: auto;
}

.auth-session-lock__text {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.32);
}

.auth-main {
  position: relative;
  z-index: 10;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
}

@keyframes auth-float {
  0%,
  100% {
    transform: translate3d(0, 0, 0);
  }

  50% {
    transform: translate3d(0, -10px, 0);
  }
}
</style>
