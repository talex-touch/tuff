<script setup lang="ts">
import { ref } from 'vue'
import { useGalleryLoop } from './use-gallery-loop'

const props = defineProps<{
  toggleLabel: string
  itemLabels: [string, string, string]
}>()

const items = [
  { icon: 'i-carbon-star', x: -56, y: -34 },
  { icon: 'i-carbon-moon', x: 0, y: -62 },
  { icon: 'i-carbon-music', x: 56, y: -34 },
]

// Opens and closes on its own until someone presses the button — the goo only
// shows while the items travel, and a menu that sits closed reads as one dot.
const open = ref(false)
let userDriven = false
useGalleryLoop(() => {
  if (!userDriven)
    open.value = !open.value
}, 2200, 700)

function toggle() {
  userDriven = true
  open.value = !open.value
}
</script>

<template>
  <TxLiquid
    class="docs-gallery__liquid"
    :blur="8"
    fill="var(--tx-fill-color)"
    shadow="1px 2px 8px rgba(0, 0, 0, 0.24), inset 0 0 0 1px rgba(127, 127, 127, 0.16)"
  >
    <TxLiquidItem
      v-for="(item, index) in items"
      :key="item.icon"
      class="docs-gallery__liquid-slot"
      :x="open ? item.x : 0"
      :y="open ? item.y : 0"
      transition="bouncy"
      :delay="index * 40"
    >
      <TxButton
        circle
        variant="ghost"
        :border="false"
        :icon="item.icon"
        class="docs-gallery__liquid-btn docs-gallery__liquid-item"
        :class="{ 'is-tucked': !open }"
        :aria-label="props.itemLabels[index]"
        :tabindex="open ? 0 : -1"
      />
    </TxLiquidItem>
    <TxLiquidItem class="docs-gallery__liquid-slot">
      <TxButton
        circle
        variant="ghost"
        :border="false"
        icon="i-carbon-add"
        class="docs-gallery__liquid-btn docs-gallery__liquid-main"
        :class="{ 'is-open': open }"
        :aria-label="props.toggleLabel"
        :aria-expanded="open"
        @click="toggle"
      />
    </TxLiquidItem>
  </TxLiquid>
</template>
