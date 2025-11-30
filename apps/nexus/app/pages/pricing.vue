<script setup lang="ts">
import { PricingTable } from '@clerk/nuxt/components'
import { computed } from 'vue'

definePageMeta({
  layout: 'home',
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

const { t } = useI18n()
const runtimeConfig = useRuntimeConfig()

const pricingTableId = computed(() => runtimeConfig.public?.clerk?.pricingTableId || '')
const publishableKey = computed(() => runtimeConfig.public?.clerk?.publishableKey || '')
const hasPricingConfig = computed(() => Boolean(pricingTableId.value && publishableKey.value))
</script>

<template>
  <section class="relative mx-auto w-full flex flex-col gap-12 px-24 py-24 lg:px-12 sm:px-8">
    <header class="text-center space-y-4">
      <p class="mx-auto inline-flex border border-primary/15 rounded-full bg-dark/5 px-4 py-1 text-xs text-black/80 font-semibold tracking-widest uppercase dark:border-light/20 dark:bg-light/10 dark:text-light/80">
        {{ t('nav.pricing') }}
      </p>
      <h1 class="text-3xl text-black font-semibold tracking-tight sm:text-4xl dark:text-light">
        {{ t('pricing.title') }}
      </h1>
      <p class="mx-auto max-w-2xl text-base text-black/70 dark:text-light/80">
        {{ t('pricing.subtitle') }}
      </p>
    </header>

    <div class="mx-auto max-w-[70%] w-full">
      <ClientOnly>
        <template #fallback>
          <div class="text-center text-sm text-black/70 dark:text-light/80">
            {{ t('pricing.loading') }}
          </div>
        </template>
        <PricingTable
          v-if="hasPricingConfig"
          :publishable-key="publishableKey"
          :pricing-table-id="pricingTableId"
        />
        <div
          v-else
          class="text-center text-sm text-black/70 dark:text-light/80"
        >
          {{ t('pricing.missingTable') }}
        </div>
      </ClientOnly>
    </div>
  </section>
</template>
