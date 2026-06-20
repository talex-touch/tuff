<script setup lang="ts">
import { computed } from 'vue'

interface DocHeroProps {
  title?: string
  description?: string
  sinceLabel?: string
  betaLabel?: string
  readTimeLabel?: string
  updatedLabel?: string
  verifiedLabel?: string
}

const props = withDefaults(defineProps<DocHeroProps>(), {
  title: '',
  description: '',
  sinceLabel: '',
  betaLabel: '',
  readTimeLabel: '',
  updatedLabel: '',
  verifiedLabel: '',
})

const tagItems = computed(() => ([
  props.verifiedLabel
    ? { label: props.verifiedLabel, icon: 'i-carbon-checkmark-filled', variant: 'badge' }
    : null,
  props.sinceLabel ? { label: props.sinceLabel, variant: 'since' } : null,
  props.betaLabel ? { label: props.betaLabel, variant: 'beta' } : null,
  props.readTimeLabel ? { label: props.readTimeLabel, icon: 'i-carbon-time' } : null,
  props.updatedLabel ? { label: props.updatedLabel, icon: 'i-carbon-calendar' } : null,
].filter(Boolean) as Array<{ label: string, icon?: string, variant?: 'badge' | 'beta' | 'since' }>))
const hasTags = computed(() => tagItems.value.length > 0)
</script>

<template>
  <section class="docs-hero">
    <div class="docs-hero__content">
      <div v-if="hasTags" class="docs-hero__tags">
        <span
          v-for="(tag, index) in tagItems"
          :key="`${tag.label}-${index}`"
          class="docs-hero__tag"
          :class="{
            'docs-hero__badge': tag.variant === 'badge',
            'docs-hero__beta': tag.variant === 'beta',
            'docs-hero__since': tag.variant === 'since',
          }"
        >
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
  border-radius: calc(var(--tx-border-radius-round, 20px) + 8px);
  border: 1px solid var(--tx-border-color-lighter);
  --docs-hero-grid-opacity: 0.35;
  --docs-hero-tag-border: color-mix(in srgb, var(--tx-border-color) 62%, transparent);
  --docs-hero-tag-bg: color-mix(in srgb, var(--tx-fill-color-light) 72%, transparent);
  --docs-hero-tag-text: color-mix(in srgb, var(--tx-text-color-secondary) 90%, var(--tx-text-color-primary));
  background:
    radial-gradient(circle at center, color-mix(in srgb, var(--tx-text-color-primary) 18%, transparent) 0 1px, transparent 1.4px) 0 0 / 16px 16px,
    linear-gradient(135deg, color-mix(in srgb, var(--tx-color-primary) 4%, transparent), transparent 58%);
  box-shadow: none;
  overflow: hidden;
}

.docs-hero::before {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at center, color-mix(in srgb, var(--tx-text-color-primary) 22%, transparent) 0 1px, transparent 1.4px) 8px 8px / 24px 24px;
  content: '';
  mix-blend-mode: multiply;
  opacity: var(--docs-hero-grid-opacity, 0.35);
}

.docs-hero::after {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--tx-bg-color) 42%, transparent), transparent 28%, transparent 72%, color-mix(in srgb, var(--tx-bg-color) 48%, transparent)),
    linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--tx-bg-color) 28%, transparent) 100%);
  content: '';
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
  border-radius: calc(var(--tx-border-radius-round, 20px) - 8px);
  border: 1px solid var(--docs-hero-tag-border);
  background: var(--docs-hero-tag-bg);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  font-size: calc(var(--tx-font-size-base, 14px) - 1px);
  font-weight: 600;
  color: var(--docs-hero-tag-text);
  letter-spacing: 0.01em;
}

.docs-hero__badge {
  border-color: color-mix(in srgb, var(--tx-color-primary) 35%, var(--tx-border-color));
  background: color-mix(in srgb, var(--tx-color-primary) 14%, transparent);
  color: color-mix(in srgb, var(--tx-color-primary) 82%, var(--tx-text-color-primary));
}

.docs-hero__beta {
  border-color: color-mix(in srgb, var(--tx-color-warning) 46%, var(--tx-border-color));
  background: color-mix(in srgb, var(--tx-color-warning) 18%, transparent);
  color: color-mix(in srgb, var(--tx-color-warning) 84%, var(--tx-text-color-primary));
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.docs-hero__since {
  border-color: color-mix(in srgb, var(--tx-color-success) 42%, var(--tx-border-color));
  background: color-mix(in srgb, var(--tx-color-success) 16%, transparent);
  color: color-mix(in srgb, var(--tx-color-success) 82%, var(--tx-text-color-primary));
}

.docs-hero__tag-icon {
  font-size: var(--tx-font-size-base, 14px);
  color: currentColor;
  opacity: 0.75;
}

.docs-hero__title {
  margin: 0;
  font-size: 3rem;
  font-weight: 700;
  letter-spacing: -0.035em;
  color: var(--tx-text-color-primary);
}

.docs-hero__desc {
  margin: 0;
  max-width: 640px;
  font-size: 1.1rem;
  color: var(--tx-text-color-secondary);
}

::global(.dark .docs-hero),
::global([data-theme='dark'] .docs-hero) {
  --docs-hero-grid-opacity: 0.5;
}

::global(.dark .docs-hero::before),
::global([data-theme='dark'] .docs-hero::before) {
  mix-blend-mode: screen;
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
