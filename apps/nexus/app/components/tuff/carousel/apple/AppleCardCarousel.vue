<script setup lang="ts">
import Icon from '~/components/icon/Icon.vue'
import { CarouselKey } from './AppleCarouselContext'

interface Props {
  initialScroll?: number
}

const props = withDefaults(defineProps<Props>(), {
  initialScroll: 0,
})

const carouselRef = ref<HTMLDivElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(true)
const currentIndex = ref(0)

const isMobile = computed(() => {
  return window && window.innerWidth < 768
})

onMounted(() => {
  if (carouselRef.value) {
    carouselRef.value.scrollLeft = props.initialScroll
    checkScrollability()
  }
})

watch(
  () => props.initialScroll,
  (newVal) => {
    if (carouselRef.value) {
      carouselRef.value.scrollLeft = newVal
      checkScrollability()
    }
  },
)

function checkScrollability() {
  if (carouselRef.value) {
    const { scrollLeft, scrollWidth, clientWidth } = carouselRef.value
    canScrollLeft.value = scrollLeft > 0
    canScrollRight.value = scrollLeft < scrollWidth - clientWidth
  }
}

function scrollLeft() {
  if (carouselRef.value) {
    carouselRef.value.scrollBy({ left: -300, behavior: 'smooth' })
  }
}

function scrollRight() {
  if (carouselRef.value) {
    carouselRef.value.scrollBy({ left: 300, behavior: 'smooth' })
  }
}

function handleCardClose(index: number) {
  if (carouselRef.value) {
    const cardWidth = isMobile.value ? 230 : 384 // (md:w-96)
    const gap = isMobile.value ? 4 : 8
    const scrollPosition = (cardWidth + gap) * (index + 1)
    carouselRef.value.scrollTo({
      left: scrollPosition,
      behavior: 'smooth',
    })
    currentIndex.value = index
  }
}

provide(CarouselKey, {
  onCardClose: handleCardClose,
  currentIndex,
})
</script>

<template>
  <div class="relative w-full">
    <div
      ref="carouselRef"
      class="[scrollbar-width:none] w-full flex overflow-x-scroll overscroll-x-auto scroll-smooth py-10 md:py-20"
      @scroll="checkScrollability"
    >
      <div
        class="absolute right-0 z-[1000] h-auto w-[5%] overflow-hidden from-white/0 to-white/100 bg-gradient-to-l"
      />

      <div class="mx-auto max-w-7xl flex flex-row justify-start gap-4 pl-4">
        <slot />
      </div>
    </div>
    <div class="mr-10 flex justify-end gap-2">
      <button
        class="bg-black-900 relative z-40 size-10 flex cursor-pointer items-center justify-center rounded-full disabled:opacity-75"
        :disabled="!canScrollLeft"
        @click="scrollLeft"
      >
        <Icon
          name="i-carbon-arrow-left"
          class="text-white-500 size-6"
        />
      </button>
      <button
        class="bg-black-900 relative z-40 size-10 flex cursor-pointer items-center justify-center rounded-full disabled:opacity-75"
        :disabled="!canScrollRight"
        @click="scrollRight"
      >
        <Icon
          name="i-carbon-arrow-right"
          class="text-white-500 size-6"
        />
      </button>
    </div>
  </div>
</template>
