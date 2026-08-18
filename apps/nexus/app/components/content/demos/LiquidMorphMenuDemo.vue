<script setup lang="ts">
import { ref } from 'vue'

const open = ref(false)
</script>

<template>
  <div class="liquid-menu">
    <TxLiquid
      class="liquid-menu__stage"
      :blur="8"
      fill="var(--tx-bg-color, #fff)"
      shadow="0 2px 8px rgba(0, 0, 0, 0.14), inset 0 0 0 1px rgba(127, 127, 127, 0.12)"
    >
      <TxLiquidItem class="liquid-menu__slot" :x="open ? -64 : 0" :y="open ? -44 : 0" transition="bouncy">
        <TxButton circle variant="ghost" :border="false" class="liquid-menu__btn" aria-label="Star">
          ✦
        </TxButton>
      </TxLiquidItem>
      <TxLiquidItem class="liquid-menu__slot" :x="0" :y="open ? -76 : 0" transition="bouncy" :delay="40">
        <TxButton circle variant="ghost" :border="false" class="liquid-menu__btn" aria-label="Moon">
          ☾
        </TxButton>
      </TxLiquidItem>
      <TxLiquidItem class="liquid-menu__slot" :x="open ? 64 : 0" :y="open ? -44 : 0" transition="bouncy" :delay="80">
        <TxButton circle variant="ghost" :border="false" class="liquid-menu__btn" aria-label="Note">
          ♪
        </TxButton>
      </TxLiquidItem>
      <TxLiquidItem class="liquid-menu__slot">
        <TxButton
          circle
          variant="ghost"
          :border="false"
          class="liquid-menu__btn liquid-menu__btn--main"
          :class="{ 'liquid-menu__btn--open': open }"
          aria-label="Toggle menu"
          @click="open = !open"
        >
          ＋
        </TxButton>
      </TxLiquidItem>
    </TxLiquid>
  </div>
</template>

<style scoped>
.liquid-menu {
  display: flex;
  justify-content: center;
  padding: 16px 0 0;
}

/* Size the group to contain the full travel of its items. */
.liquid-menu__stage {
  width: 240px;
  height: 168px;
}

.liquid-menu__slot {
  position: absolute;
  left: calc(50% - 24px);
  bottom: 16px;
}

/* Item backgrounds stay transparent — the liquid below IS the surface. */
.liquid-menu__btn {
  width: 48px;
  height: 48px;
  font-size: 18px;
}

.liquid-menu__btn--main {
  transition: rotate 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.liquid-menu__btn--open {
  rotate: 45deg;
}
</style>
