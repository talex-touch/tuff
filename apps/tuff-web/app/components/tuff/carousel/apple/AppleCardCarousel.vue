<script setup lang="ts">
import { CarouselKey } from './AppleCarouselContext'

interface Props {
  initialScroll?: number
  prevLabel?: string
  nextLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  initialScroll: 0,
  prevLabel: 'Previous',
  nextLabel: 'Next',
})

/** The track's gap-4, between one card and the next. */
const CARD_GAP = 16

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
    canScrollLeft.value = scrollLeft > 1
    // Sub-pixel scroll positions never quite reach the end.
    canScrollRight.value = scrollLeft < scrollWidth - clientWidth - 1
  }
}

/** One card per press, so a page never stops halfway across a card. */
function cardStep(): number {
  const card = carouselRef.value?.querySelector<HTMLElement>('.apple-card')
  return card ? card.getBoundingClientRect().width + CARD_GAP : 300
}

function scrollLeft() {
  if (carouselRef.value) {
    carouselRef.value.scrollBy({ left: -cardStep(), behavior: 'smooth' })
  }
}

function scrollRight() {
  if (carouselRef.value) {
    carouselRef.value.scrollBy({ left: cardStep(), behavior: 'smooth' })
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
    <!-- Above the row and on its right edge: under it they fell past the
         bottom of a 100dvh section on 900px-tall screens. -->
    <div class="AppleCardCarousel-Controls mx-auto max-w-7xl flex justify-end gap-2 px-4">
      <button
        type="button"
        class="AppleCardCarousel-Arrow"
        :aria-label="props.prevLabel"
        :disabled="!canScrollLeft"
        @click="scrollLeft"
      >
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="M15.5 10H4.5M9 5.5 4.5 10 9 14.5" />
        </svg>
      </button>
      <button
        type="button"
        class="AppleCardCarousel-Arrow"
        :aria-label="props.nextLabel"
        :disabled="!canScrollRight"
        @click="scrollRight"
      >
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="M4.5 10h11M11 5.5l4.5 4.5-4.5 4.5" />
        </svg>
      </button>
    </div>
    <div
      ref="carouselRef"
      class="[scrollbar-width:none] AppleCardCarousel-Track w-full flex overflow-x-scroll overscroll-x-auto scroll-smooth pb-6 pt-4 md:pb-8 md:pt-5"
      @scroll="checkScrollability"
    >
      <div
        class="absolute right-0 z-[1000] h-auto w-[5%] overflow-hidden from-white/0 to-white/100 bg-gradient-to-l"
      />

      <div class="mx-auto max-w-7xl flex flex-row justify-start gap-4 pl-4">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Landing sections strip button borders and outlines, so the ring and the
   focus mark are both drawn with box-shadow. */
.AppleCardCarousel-Controls .AppleCardCarousel-Arrow {
  position: relative;
  z-index: 40;
  display: inline-grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 999px;
  background: rgba(246, 247, 244, 0.08);
  box-shadow: inset 0 0 0 1px rgba(246, 247, 244, 0.14);
  color: #f6f7f4;
  cursor: pointer;
  transition: background-color 160ms ease, opacity 160ms ease;
}

/* A drawn arrow, so the stroke weight and the centring are ours. */
.AppleCardCarousel-Arrow svg {
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.AppleCardCarousel-Controls .AppleCardCarousel-Arrow:not(:disabled):hover {
  background: rgba(246, 247, 244, 0.16);
}

.AppleCardCarousel-Controls .AppleCardCarousel-Arrow:focus-visible {
  box-shadow:
    inset 0 0 0 1px rgba(246, 247, 244, 0.14),
    0 0 0 2px rgba(64, 158, 255, 0.8);
}

/* Clearly off, not just a shade dimmer than the live one beside it. */
.AppleCardCarousel-Controls .AppleCardCarousel-Arrow:disabled {
  opacity: 0.3;
  cursor: default;
}
</style>
