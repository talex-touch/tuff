<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  betaLabel?: string
}>(), {
  betaLabel: '',
})
</script>

<template>
  <span class="TuffLandingIntelligenceTitle">
    <span class="TuffLandingIntelligenceTitle-Text">{{ title }}</span>
    <span
      v-if="betaLabel"
      class="TuffLandingIntelligenceTitle-Beta"
    >
      {{ betaLabel }}
    </span>
  </span>
</template>

<style lang="scss" scoped>
.TuffLandingIntelligenceTitle {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.TuffLandingIntelligenceTitle-Text {
  display: inline;
  font-weight: 600;
  background: #1d1d1f;
  background-clip: text;
  -webkit-text-fill-color: rgba(0, 0, 0, 0);
  box-decoration-break: clone;
  background-image: linear-gradient(108deg, #0894ff, #c959dd 34%, #ff2e54 68%, #ff9004);
}

.TuffLandingIntelligenceTitle-Beta {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 0.15rem 0.5rem;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.08);
}
</style>
