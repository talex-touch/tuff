<script setup lang="ts">
interface PillarItem {
  title: string
  summary: string
  accent?: string
}

const props = defineProps<{ items: PillarItem[] }>()
</script>

<template>
  <div class="tuff-pillars">
    <div v-for="item in props.items" :key="item.title" class="tuff-pillars__card">
      <div v-if="item.accent" class="tuff-pillars__accent">
        {{ item.accent }}
      </div>
      <div class="tuff-pillars__title">
        {{ item.title }}
      </div>
      <p class="tuff-pillars__summary">
        {{ item.summary }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.tuff-pillars {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.tuff-pillars__card {
  position: relative;
  border-radius: 18px;
  padding: 16px;
  border: 1px solid var(--docs-border);
  background: linear-gradient(135deg, rgba(10, 132, 255, 0.08), rgba(120, 220, 255, 0.12));
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
  overflow: hidden;
}

.tuff-pillars__card:nth-child(2) {
  background: linear-gradient(135deg, rgba(110, 231, 183, 0.12), rgba(16, 185, 129, 0.16));
}

.tuff-pillars__card:nth-child(3) {
  background: linear-gradient(135deg, rgba(248, 250, 252, 0.6), rgba(148, 163, 184, 0.2));
}

.tuff-pillars__accent {
  font-size: 12px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--docs-muted);
}

.tuff-pillars__title {
  font-size: 16px;
  font-weight: 600;
  margin-top: 6px;
  color: var(--docs-ink);
}

.tuff-pillars__summary {
  font-size: 13px;
  color: var(--docs-muted);
  margin-top: 6px;
}

:global(.dark .tuff-pillars__card),
:global([data-theme='dark'] .tuff-pillars__card) {
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}
</style>
