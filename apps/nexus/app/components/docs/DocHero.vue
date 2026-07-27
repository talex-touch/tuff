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
      <h1 class="docs-hero__title">
        {{ props.title }}
      </h1>
      <p v-if="props.description" class="docs-hero__desc">
        {{ props.description }}
      </p>
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
    </div>
  </section>
</template>

<style scoped>
/* Minimal editorial hero: no card, no chrome — type carries the page. */
.docs-hero {
  position: relative;
  isolation: isolate;
}

.docs-hero__content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.docs-hero__title {
  margin: 0;
  font-size: 3.5rem;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.03;
  color: var(--tx-text-color-primary);
  text-wrap: balance;
}

.docs-hero__desc {
  margin: 0;
  max-width: 34em;
  font-size: 1.3125rem;
  line-height: 1.5;
  font-weight: 400;
  color: var(--tx-text-color-secondary);
  text-wrap: pretty;
}

/* Metadata reads as a quiet caption line, not as a row of badges. */
.docs-hero__tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  margin-top: 2px;
  font-size: 13px;
  color: var(--tx-text-color-placeholder, var(--tx-text-color-secondary));
}

.docs-hero__tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  letter-spacing: 0;
}

.docs-hero__badge {
  color: color-mix(in srgb, var(--tx-color-primary) 78%, var(--tx-text-color-secondary));
}

.docs-hero__beta {
  color: color-mix(in srgb, var(--tx-color-warning) 78%, var(--tx-text-color-secondary));
  text-transform: uppercase;
  letter-spacing: 0;
  font-size: 11px;
  font-weight: 700;
}

/* Version/scope reads as caption text; only status badges earn colour. */
.docs-hero__since {
  color: inherit;
}

.docs-hero__tag-icon {
  font-size: 13px;
  color: currentColor;
  opacity: 0.8;
}

@media (max-width: 768px) {
  .docs-hero__content {
    gap: 14px;
  }

  .docs-hero__title {
    font-size: 2.35rem;
  }

  .docs-hero__desc {
    font-size: 1.0625rem;
  }
}
</style>
