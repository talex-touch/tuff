import type { InjectionKey, Ref } from 'vue'

export interface CarouselContextType {
  onCardClose: (index: number) => void
  currentIndex: Ref<number>
}

// eslint-disable-next-line symbol-description
export const CarouselKey = Symbol() as InjectionKey<CarouselContextType>
