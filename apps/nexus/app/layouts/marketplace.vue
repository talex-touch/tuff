<script lang="ts" setup>
import TouchRay from '~/components/tuff/background/TouchRay.vue'

const { t } = useI18n()
</script>

<template>
  <div class="Layout-Market bg-white text-black dark:bg-dark dark:text-light">
    <div class="Layout-Market-Background z-1">
      <TouchRay :ray-speed="1.5" :light-spread="2" />
    </div>
    <div class="relative z-10 min-h-screen flex flex-col">
      <TheHeader class="z-10" title="Marketplace" />
      <main class="container mx-auto p-4 lg:p-8">
        <header class="pt-16 text-center">
          <h1 class="text-16xl m-0 text-black font-bold sm:text-4xl dark:text-light">
            {{ t('market.hero.title') }}
          </h1>
          <p class="m-0 mx-auto max-w-2xl text-base text-black/70 dark:text-light/80">
            {{ t('market.hero.subtitle') }}
          </p>
        </header>
        <slot />
      </main>
      <TuffFooter />
    </div>
  </div>
</template>

<style scoped>
.Layout-Market-Background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;

  animation: fade-in 2.5s ease-in-out;
  mask-image: radial-gradient(circle at top, #000000 15%, #0000 68%);
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
