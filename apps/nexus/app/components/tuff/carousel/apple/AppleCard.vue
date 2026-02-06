<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import { AnimatePresence, Motion } from 'motion-v'
import { inject, onMounted, onUnmounted, ref, watch } from 'vue'
import Icon from '~/components/icon/Icon.vue'
import Logo from '~/images/logo.svg'
import AppleBlurImage from './AppleBlurImage.vue'
import { CarouselKey } from './AppleCarouselContext'

interface Card {
  src: string
  title: string
  category: string
  [key: string]: any
}

interface Props {
  card: Card
  index: number
  layout?: boolean
  onCardClick?: (card: Card, index: number) => void
}

const props = withDefaults(defineProps<Props>(), {
  layout: false,
})

const open = ref(false)
const containerRef = ref<HTMLDivElement | null>(null)
const carouselContext = inject(CarouselKey)

if (!carouselContext) {
  throw new Error('Card must be used within a Carousel')
}

const { onCardClose, currentIndex } = carouselContext

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    handleClose()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

watch(open, (newVal) => {
  if (newVal) {
    document.body.style.overflow = 'hidden'
  }
  else {
    document.body.style.overflow = 'auto'
  }
})

onClickOutside(containerRef, () => handleClose())

function handleOpen() {
  if (props.onCardClick) {
    props.onCardClick(props.card, props.index)
    return
  }
  open.value = true
}

function handleClose() {
  open.value = false
  onCardClose(props.index)
}
</script>

<template>
  <Teleport to="body">
    <AnimatePresence mode="wait">
      <div
        v-if="open"
        class="fixed inset-0 z-50 h-screen overflow-auto"
      >
        <Motion
          as="div"
          :initial="{ opacity: 0 }"
          :animate="{ opacity: 1 }"
          :exit="{ opacity: 0 }"
          class="fixed inset-0 size-full bg-black/80 backdrop-blur-lg"
        />
        <Motion
          ref="containerRef"
          as="div"
          :initial="{ opacity: 0 }"
          :animate="{ opacity: 1 }"
          :exit="{ opacity: 0 }"
          :layout-id="layout ? `card-${card.title}` : undefined"
          class="relative z-[60] mx-auto my-10 h-fit max-w-5xl rounded-3xl bg-white p-4 font-sans dark:bg-neutral-900 md:p-10"
        >
          <TxButton
            variant="bare"
            circle
            native-type="button"
            class="sticky right-0 top-4 ml-auto size-8 flex items-center justify-center rounded-full bg-black dark:bg-white"
            @click="handleClose"
          >
            <Icon
              name="tabler:x"
              class="size-6 text-neutral-100 dark:text-neutral-900"
            />
          </TxButton>
          <Motion
            as="div"
            :layout-id="layout ? `category-${card.title}` : undefined"
            class="text-base text-black font-medium dark:text-white"
          >
            {{ card.category }}
          </Motion>
          <Motion
            as="div"
            :layout-id="layout ? `title-${card.title}` : undefined"
            class="mt-4 text-2xl text-neutral-700 font-semibold md:text-5xl dark:text-white"
          >
            {{ card.title }}
          </Motion>
          <div class="py-10">
            <slot />
          </div>
        </Motion>
      </div>
    </AnimatePresence>
  </Teleport>

  <Motion
    :layout-id="layout ? `card-${card.title}` : undefined"
    class="relative z-10 h-80 w-56 flex flex-col items-start justify-start overflow-hidden rounded-3xl bg-gray-100 md:h-[40rem] md:w-96 dark:bg-neutral-900"
    @click="handleOpen"
  >
    <div
      class="pointer-events-none absolute inset-x-0 top-0 z-30 h-full from-black/50 via-transparent to-transparent bg-gradient-to-b"
    />
    <div class="relative z-40 p-8">
      <Motion
        :layout-id="layout ? `category-${card.category}` : undefined"
        class="flex items-center gap-2 text-left text-sm text-white font-medium font-sans md:text-base"
      >
        <span>{{ card.category }}</span>
        <div
          class="i-carbon-close size-4 text-white"
        />
        <img class="w-6" :src="Logo" alt="">
      </Motion>
      <Motion
        :layout-id="layout ? `title-${card.title}` : undefined"
        class="[text-wrap:balance] mt-2 max-w-xs text-left text-xl text-white font-semibold font-sans md:text-3xl"
      >
        {{ card.title }}
      </Motion>
    </div>
    <AppleBlurImage
      v-if="card.src?.length"
      :src="card.src"
      :alt="card.title"
      class="absolute inset-0 z-10 object-cover"
      :fill="true"
    />
    <div v-if="card.component" class="absolute inset-0 z-10">
      <component :is="card.component" />
    </div>
  </Motion>
</template>
