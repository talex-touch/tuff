<script setup lang="ts">
import { computed } from 'vue'
import FlickeringGrid from '~/components/docs/FlickeringGrid.vue'

interface DocHeroProps {
  title?: string
  description?: string
  sinceLabel?: string
  readTimeLabel?: string
  updatedLabel?: string
}

const props = withDefaults(defineProps<DocHeroProps>(), {
  title: '',
  description: '',
  sinceLabel: '',
  readTimeLabel: '',
  updatedLabel: '',
})

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const gridColor = computed(() => (isDark.value ? '#e2e8f0' : '#0f172a'))
const gridMaxOpacity = computed(() => (isDark.value ? 0.22 : 0.28))
const gridFlickerChance = computed(() => (isDark.value ? 0.26 : 0.32))
const gridOpacity = computed(() => (isDark.value ? 0.5 : 0.35))
const heroStyle = computed(() => ({
  '--docs-hero-grid-opacity': gridOpacity.value,
  '--docs-hero-border': isDark.value ? 'rgba(148, 163, 184, 0.26)' : 'rgba(15, 23, 42, 0.08)',
  '--docs-hero-tag-border': isDark.value ? 'rgba(148, 163, 184, 0.32)' : 'rgba(15, 23, 42, 0.08)',
  '--docs-hero-tag-bg': isDark.value ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.04)',
  '--docs-hero-tag-text': isDark.value ? 'rgba(226, 232, 240, 0.86)' : 'rgba(71, 85, 105, 0.86)',
}))
const tagItems = computed(() => ([
  props.sinceLabel ? { label: props.sinceLabel } : null,
  props.readTimeLabel ? { label: props.readTimeLabel, icon: 'i-carbon-time' } : null,
  props.updatedLabel ? { label: props.updatedLabel, icon: 'i-carbon-calendar' } : null,
].filter(Boolean) as Array<{ label: string, icon?: string }>))
const hasTags = computed(() => tagItems.value.length > 0)
</script>

<template>
  <section class="docs-hero" :class="{ 'is-dark': isDark }" :style="heroStyle">
    <FlickeringGrid
      class="docs-hero__grid"
      :color="gridColor"
      :max-opacity="gridMaxOpacity"
      :flicker-chance="gridFlickerChance"
    />
    <div class="docs-hero__content">
      <div v-if="hasTags" class="docs-hero__tags">
        <span v-for="(tag, index) in tagItems" :key="`${tag.label}-${index}`" class="docs-hero__tag">
          <span v-if="tag.icon" :class="tag.icon" class="docs-hero__tag-icon" aria-hidden="true" />
          <span>{{ tag.label }}</span>
        </span>
      </div>
      <h1 class="docs-hero__title">
        {{ props.title }}
      </h1>
      <p v-if="props.description" class="docs-hero__desc">
        {{ props.description }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.docs-hero {
  position: relative;
  padding: 36px 44px;
  border-radius: 28px;
  border: 1px solid var(--docs-hero-border, rgba(15, 23, 42, 0.08));
  background: transparent;
  box-shadow: none;
  overflow: hidden;
}

.docs-hero__grid {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: var(--docs-hero-grid-opacity, 0.35);
  mix-blend-mode: multiply;
}

.docs-hero__content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.docs-hero__tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.docs-hero__tag {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--docs-hero-tag-border, rgba(15, 23, 42, 0.08));
  background: var(--docs-hero-tag-bg, rgba(15, 23, 42, 0.04));
  font-size: 13px;
  font-weight: 600;
  color: var(--docs-hero-tag-text, rgba(71, 85, 105, 0.86));
  letter-spacing: 0.01em;
}

.docs-hero__tag-icon {
  font-size: 14px;
  opacity: 0.75;
}

.docs-hero__title {
  margin: 0;
  font-size: 3rem;
  font-weight: 700;
  letter-spacing: -0.035em;
  color: var(--docs-ink);
}

::global(.dark .docs-hero__title),
::global([data-theme='dark'] .docs-hero__title) {
  color: rgba(248, 250, 252, 0.95);
}

.docs-hero__desc {
  margin: 0;
  max-width: 640px;
  font-size: 1.1rem;
  color: rgba(71, 85, 105, 0.85);
}

::global(.dark .docs-hero__desc),
::global([data-theme='dark'] .docs-hero__desc) {
  color: rgba(226, 232, 240, 0.75);
}

.docs-hero.is-dark .docs-hero__grid {
  mix-blend-mode: screen;
}

.docs-hero.is-dark .docs-hero__title {
  color: rgba(248, 250, 252, 0.95);
}

.docs-hero.is-dark .docs-hero__desc {
  color: rgba(226, 232, 240, 0.75);
}

::global(.dark .docs-hero),
::global([data-theme='dark'] .docs-hero) {
  --docs-hero-border: rgba(148, 163, 184, 0.3);
  --docs-hero-tag-border: rgba(148, 163, 184, 0.35);
  --docs-hero-tag-bg: rgba(148, 163, 184, 0.12);
  --docs-hero-tag-text: rgba(226, 232, 240, 0.86);
  border-color: var(--docs-hero-border);
}

::global(.dark) .docs-hero,
::global([data-theme='dark']) .docs-hero {
  --docs-hero-border: rgba(148, 163, 184, 0.3);
  --docs-hero-tag-border: rgba(148, 163, 184, 0.35);
  --docs-hero-tag-bg: rgba(148, 163, 184, 0.12);
  --docs-hero-tag-text: rgba(226, 232, 240, 0.86);
  border-color: var(--docs-hero-border);
}

.docs-hero.is-dark {
  --docs-hero-border: rgba(148, 163, 184, 0.3);
  --docs-hero-tag-border: rgba(148, 163, 184, 0.35);
  --docs-hero-tag-bg: rgba(148, 163, 184, 0.12);
  --docs-hero-tag-text: rgba(226, 232, 240, 0.86);
  border-color: var(--docs-hero-border);
}

::global(.dark .docs-hero__badge),
::global([data-theme='dark'] .docs-hero__badge) {
  border-color: rgba(125, 211, 252, 0.3);
  background: rgba(56, 189, 248, 0.16);
  color: rgba(226, 232, 240, 0.9);
}

@media (max-width: 768px) {
  .docs-hero {
    padding: 24px;
  }

  .docs-hero__title {
    font-size: 2.2rem;
  }

  .docs-hero__desc {
    font-size: 0.95rem;
  }
}
</style>
