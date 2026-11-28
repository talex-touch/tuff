<script setup lang="ts">
import type { HairlineFigureName } from '../../TuffLandingHairline.vue'
import TuffLandingHairline from '../../TuffLandingHairline.vue'

// Card face for a real plugin: its figure on a dotted plate, and the word that
// summons it. The card's own name and line sit above, from AppleCard.

defineProps<{
  figure: HairlineFigureName
  summon: string
  label: string
}>()
</script>

<template>
  <div class="PluginCardHairline">
    <div class="PluginCardHairline-Figure">
      <TuffLandingHairline :figure="figure" :intensity="0.55" :label="label" />
    </div>
    <kbd class="PluginCardHairline-Summon">{{ summon }}</kbd>
  </div>
</template>

<style scoped>
.PluginCardHairline {
  --plate: #0b0c0e;

  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  background:
    radial-gradient(circle at 1px 1px, rgba(246, 247, 244, 0.06) 1px, transparent 0) 0 0 / 16px 16px,
    var(--plate);

  --hairline-plate: var(--plate);
  --hairline-hi: #f6f7f4;
  --hairline-edge: #a5a8b2;
  --hairline-mid: #4f525b;
  --hairline-lo: #24262c;
}

.PluginCardHairline-Figure {
  padding: 0 0.75rem 3.6rem;
}

.PluginCardHairline-Summon {
  position: absolute;
  left: 2rem;
  bottom: 1.5rem;
  border: 1px solid rgba(246, 247, 244, 0.18);
  border-radius: 6px;
  background: rgba(246, 247, 244, 0.04);
  padding: 0.15rem 0.5rem;
  color: rgba(246, 247, 244, 0.62);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.78rem;
}
</style>
