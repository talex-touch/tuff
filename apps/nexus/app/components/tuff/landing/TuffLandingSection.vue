<script setup lang="ts">
import { ref, useSlots } from 'vue'
import { useGsapReveal } from '~/composables/useGsapReveal'

const props = withDefaults(defineProps<{
  id?: string
  sectionClass?: string
  containerClass?: string
  sticky?: string
  stickyClass?: string
  title?: string
  subtitle?: string
  titleTag?: string
  headerClass?: string
  titleClass?: string
  subtitleClass?: string
  revealOptions?: Parameters<typeof useGsapReveal>[1]
}>(), {
  sectionClass: 'min-h-screen flex flex-col justify-center',
  containerClass: 'max-w-6xl w-full flex flex-col gap-12',
  stickyClass: '',
  titleTag: 'h2',
  headerClass: '',
  titleClass: 'text-[clamp(.75rem,1vw+1.5rem,1.3rem)] font-bold leading-[1.1] tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60',
  subtitleClass: 'mx-auto my-0 max-w-3xl text-[clamp(.6rem,1vw+1.3rem,1.1rem)] font-semibold leading-relaxed op-70',
})

const slots = useSlots()
const sectionRef = ref<HTMLElement | null>(null)

useGsapReveal(sectionRef, props.revealOptions ?? {})
</script>

<template>
  <section
    :id="props.id"
    ref="sectionRef"
    class="relative isolate overflow-hidden bg-black py-24 text-white" :class="[
      props.sectionClass,
    ]"
  >
    <div
      v-if="slots.decoration"
      class="pointer-events-none absolute inset-0 -z-10"
    >
      <slot name="decoration" />
    </div>

    <div
      class="relative mx-auto w-full px-6"
      :class="props.containerClass"
    >
      <template v-if="slots.sticky">
        <slot name="sticky" />
      </template>
      <TuffStickyBar
        v-else-if="props.sticky"
        :class="props.stickyClass"
        data-reveal
      >
        {{ props.sticky }}
      </TuffStickyBar>

      <template v-if="slots.header">
        <slot name="header" />
      </template>
      <header
        v-else-if="props.title || props.subtitle"
        class="text-center" :class="[
          props.headerClass,
        ]"
      >
        <component
          :is="props.titleTag"
          v-if="props.title"
          class="my-0 font-semibold leading-tight" :class="[
            props.titleClass,
          ]"
          data-reveal
        >
          {{ props.title }}
        </component>
        <p
          v-if="props.subtitle"
          class="mx-auto my-0 text-base text-white/70 leading-relaxed" :class="[
            props.subtitleClass,
          ]"
          data-reveal
        >
          {{ props.subtitle }}
        </p>
      </header>

      <slot />
    </div>
  </section>
</template>
