<script setup lang="ts">
const modes = ['pure', 'blur', 'refraction'] as const
</script>

<template>
  <div class="base-surface-flow-light-demo not-prose">
    <!-- Any mode can carry the light: it paints over the veil, under the edge. -->
    <TxBaseSurface
      v-for="mode in modes"
      :key="mode"
      class="base-surface-flow-light-demo__surface"
      :mode="mode"
      flow-light="rim"
      :radius="14"
    >
      <span class="base-surface-flow-light-demo__label">{{ mode }}</span>
    </TxBaseSurface>
  </div>
</template>

<style scoped>
.base-surface-flow-light-demo {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  padding: 20px;
  border-radius: 16px;
  background: linear-gradient(135deg, #e0e7ff, #fce7f3 55%, #fef3c7);
}

.base-surface-flow-light-demo__surface {
  height: 96px;
}

.base-surface-flow-light-demo__label {
  display: block;
  padding: 12px 14px;
  color: var(--tx-text-color-primary, #303133);
  font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
