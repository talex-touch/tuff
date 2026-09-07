<script lang="ts" setup>
import { defineAsyncComponent } from 'vue'

const TouchRay = defineAsyncComponent(() => import('~/components/tuff/background/TouchRay.vue'))

const { t } = useI18n()
</script>

<template>
  <div class="Layout-Store bg-white text-black dark:bg-dark dark:text-light">
    <div class="Layout-Store-Background z-1">
      <TouchRay :ray-speed="1.5" :light-spread="2" />
    </div>
    <div class="relative z-10 min-h-screen flex flex-col">
      <TheHeader class="z-10" title="Store" />
      <main class="Layout-Store-Main">
        <header class="Layout-Store-Hero">
          <h1 class="Layout-Store-Title">
            {{ t('store.hero.title') }}
          </h1>
          <p class="Layout-Store-Subtitle">
            {{ t('store.hero.subtitle') }}
          </p>
        </header>
        <slot />
      </main>
      <TuffFooter />
    </div>
  </div>
</template>

<style scoped>
.Layout-Store-Background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;

  animation: fade-in 2.5s ease-in-out;
  mask-image: radial-gradient(circle at top, #000000 15%, #0000 68%);
}

/*
 * One column shared by the hero and the page: the header reserves 88px for
 * its floating pill, the hero sits just under it, and the page content that
 * follows starts a fixed distance below the subtitle rather than a viewport
 * height away.
 */
.Layout-Store-Main {
  width: 100%;
  max-width: 72rem;
  margin: 0 auto;
  padding: 7.5rem clamp(1.25rem, 4vw, 3rem) 5rem;
  box-sizing: border-box;
}

.Layout-Store-Hero {
  margin: 0 auto 2.5rem;
  max-width: 40rem;
  text-align: center;
}

.Layout-Store-Title {
  margin: 0;
  font-size: clamp(2rem, 5vw, 3.25rem);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.Layout-Store-Subtitle {
  margin: 0.75rem 0 0;
  font-size: 1.0625rem;
  line-height: 1.5;
  color: color-mix(in srgb, currentColor 68%, transparent);
}

@keyframes fade-in {
  from {
    opacity: 0;
    filter: blur(18px);
  }

  to {
    opacity: 1;
    filter: blur(0px);
  }
}
</style>
