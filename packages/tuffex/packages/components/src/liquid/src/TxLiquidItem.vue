<script setup lang="ts">
import type { DissolveOptions, GooeyEffect, LiquidItemProps } from './types'
import { computed, watchEffect } from 'vue'
import { mapDissolve, mapMorphSprings, mapMove } from './tuning'
import LiquidMirroredItem from './LiquidMirroredItem.vue'
import LiquidObservedItem from './LiquidObservedItem.vue'

// Vue port of liquid-gooey's public `<Liquid.Item>` (LiquidItem.tsx +
// GooeyItem.tsx dispatch) (https://github.com/Jakubantalik/Libraries —
// MIT © 2026 Jakub Antalik). Two effects, simple normalized knobs, `advanced`
// escape hatches into the raw engine options.

defineOptions({
  name: 'TxLiquidItem',
})

const props = withDefaults(defineProps<LiquidItemProps>(), {
  effect: 'morph',
  morph: undefined,
  move: undefined,
  dissolve: undefined,
  x: 0,
  y: 0,
  scale: 1,
  transition: 'smooth',
  delay: 0,
  observe: false,
  radius: undefined,
})

const isMove = computed(() => props.effect === 'move')
const shape = computed(() => !!props.morph?.shape)
const wantsDissolve = computed(() => props.dissolve !== undefined && props.dissolve !== false)

// `dissolve` is positioned as orthogonal to `effect`, but the melt is drawn
// from the element's MEASURED rect while move's liquid deliberately lags on a
// spring — the melt would sit on the element with the surface trailing behind
// it. Refuse loudly rather than ship the mismatch.
watchEffect(() => {
  if (isMove.value && wantsDissolve.value) {
    console.warn(
      '[tuffex] TxLiquidItem: `dissolve` is ignored with effect="move": the melt '
      + 'follows the element while the liquid lags on its spring, so the two '
      + 'would visibly disagree. Use it on a morph item.',
    )
  }
})

const contactBlur = computed<DissolveOptions | undefined>(() => {
  if (isMove.value || !wantsDissolve.value)
    return undefined
  const dissolve = props.dissolve
  return typeof dissolve === 'object'
    ? { ...mapDissolve(true), ...dissolve }
    : mapDissolve(dissolve as boolean | number)
})

const evolve = computed(() =>
  shape.value ? { ...mapMorphSprings(props.morph), ...props.morph?.advanced?.evolve } : undefined,
)

const mappedMove = computed(() => (isMove.value ? mapMove(props.move) : undefined))

const effects = computed<GooeyEffect[]>(() => {
  if (isMove.value)
    return ['move']
  return shape.value ? ['evolve'] : []
})

// Anything beyond plain morph mirroring runs on the measurement engine.
const observed = computed(() =>
  isMove.value || props.observe || shape.value || !!contactBlur.value,
)
</script>

<template>
  <LiquidObservedItem
    v-if="observed"
    :effects="effects"
    :evolve="evolve"
    :move="mappedMove"
    :contact-blur="contactBlur"
    :radius="radius"
    :blob-inset="morph?.advanced?.blobInset"
    :bridge-grow="morph?.advanced?.bridgeGrow"
  >
    <slot />
  </LiquidObservedItem>
  <LiquidMirroredItem
    v-else
    :x="x"
    :y="y"
    :scale="scale"
    :transition="transition"
    :delay="delay"
    :radius="radius"
  >
    <slot />
  </LiquidMirroredItem>
</template>
