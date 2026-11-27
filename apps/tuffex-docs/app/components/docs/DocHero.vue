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
    ? { label: props.verifiedLabel, icon: 'i-carbon-checkmark-filled', variant: 'badge' as const }
    : null,
  props.sinceLabel ? { label: props.sinceLabel, variant: 'since' as const } : null,
  props.betaLabel ? { label: props.betaLabel, variant: 'beta' as const } : null,
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
.docs-hero {
  position: relative;
  isolation: isolate;
}

.docs-hero__content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.docs-hero__title {
  margin: 0;
  font-size: 3.15rem;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.05;
  color: var(--docs-ink);
  text-wrap: balance;
}

.docs-hero__desc {
  margin: 0;
  max-width: 38em;
  font-size: 1.1875rem;
  line-height: 1.55;
  font-weight: 400;
  color: var(--docs-muted);
  text-wrap: pretty;
}

.docs-hero__tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 14px;
  font-size: 13px;
  color: var(--docs-muted);
}

.docs-hero__tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 500;
}

.docs-hero__badge {
  color: color-mix(in srgb, var(--docs-accent) 78%, var(--docs-muted));
}

.docs-hero__beta {
  color: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 82%, var(--docs-ink));
  text-transform: uppercase;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.docs-hero__tag-icon {
  font-size: 13px;
  opacity: 0.85;
}

@media (max-width: 768px) {
  .docs-hero__title {
    font-size: 2.2rem;
  }

  .docs-hero__desc {
    font-size: 1.02rem;
  }
}
</style>
