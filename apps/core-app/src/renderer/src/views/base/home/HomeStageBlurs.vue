<script lang="ts" name="HomeStageBlurs" setup>
import { TxGradualBlur } from '@talex-touch/tuffex/gradual-blur'

/**
 * Top and bottom edge fades over `.HomePage-Body` while a conversation stream is active. Rendered
 * as a fragment so both blur overlays stay direct children of `.HomePage-Body`.
 */
defineProps<{
  visible: boolean
}>()
</script>

<template>
  <TxGradualBlur
    v-if="visible"
    position="top"
    height="72px"
    :strength="2.5"
    curve="bezier"
    :z-index="4"
    class="HomePage-TopBlur"
  />
  <TxGradualBlur
    v-if="visible"
    position="bottom"
    height="calc(var(--home-composer-height, 112px) + 96px)"
    :strength="2.5"
    curve="bezier"
    :z-index="4"
    class="HomePage-BottomBlur"
  />
</template>

<style lang="scss" scoped>
.HomePage-TopBlur {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 72px;
  z-index: var(--home-z-topblur);
  pointer-events: none;
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--shell-bg) 80%, transparent) 0%,
    color-mix(in srgb, var(--shell-bg) 35%, transparent) 40%,
    transparent 100%
  );
}

.HomePage-BottomBlur {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(var(--home-composer-height, 112px) + 96px);
  z-index: var(--home-z-bottomblur);
  pointer-events: none;
  background: linear-gradient(
    to top,
    color-mix(in srgb, var(--shell-bg) 85%, transparent) 0%,
    color-mix(in srgb, var(--shell-bg) 60%, transparent) 35%,
    color-mix(in srgb, var(--shell-bg) 25%, transparent) 70%,
    transparent 100%
  );
}
</style>
