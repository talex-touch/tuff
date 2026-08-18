<script setup lang="ts">
import { ref } from 'vue'

const stops = [8, 96, 184]
const pos = ref(0)
</script>

<template>
  <TxFlex direction="column" align="center" gap="20px" class="liquid-move">
    <TxLiquid
      class="liquid-move__track"
      :blur="7"
      fill="var(--tx-bg-color, #fff)"
      shadow="0 1px 5px rgba(0, 0, 0, 0.16), inset 0 0 0 1px rgba(127, 127, 127, 0.12)"
    >
      <TxLiquidItem effect="move" :move="{ trail: 0.6 }">
        <div
          class="liquid-move__thumb"
          :style="{ transform: `translateX(${stops[pos]}px)` }"
        >
          <span class="liquid-move__dot" />
        </div>
      </TxLiquidItem>
    </TxLiquid>
    <TxFlex gap="8px">
      <TxButton
        v-for="(stop, i) in stops"
        :key="stop"
        size="sm"
        round
        :variant="pos === i ? 'primary' : 'secondary'"
        @click="pos = i"
      >
        {{ i + 1 }}
      </TxButton>
    </TxFlex>
  </TxFlex>
</template>

<style scoped>
.liquid-move {
  padding: 16px 0 0;
}

.liquid-move__track {
  width: 240px;
  height: 56px;
}

/* The consumer animates the element however it likes — CSS here — and the
   liquid trails it on a spring with a droplet tail. */
.liquid-move__thumb {
  position: absolute;
  top: 8px;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 40px;
  border-radius: 999px;
  background: transparent;
  transition: transform 340ms cubic-bezier(0.3, 0.7, 0.3, 1);
}

.liquid-move__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--tx-text-color, #333);
  opacity: 0.55;
}
</style>
