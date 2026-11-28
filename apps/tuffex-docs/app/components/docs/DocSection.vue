<script setup lang="ts">
import { prefetchDocByPath } from '~/composables/useTuffexCurrentDoc'

const props = withDefaults(defineProps<{
  active?: boolean
  list?: number
  link?: string
}>(), {
  active: false,
  list: 0,
  link: undefined,
})

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <section class="DocSection" :class="{ 'DocSection--group': props.list > 0 }">
    <NuxtLink
      v-if="props.list === 0 && props.link"
      :to="props.link"
      class="DocSection-Header DocSection-Header--page"
      :class="{ 'is-active': props.active }"
      :aria-current="props.active ? 'page' : undefined"
      @pointerenter="prefetchDocByPath(props.link)"
      @focus="prefetchDocByPath(props.link)"
    >
      <slot name="header" />
    </NuxtLink>

    <button
      v-else
      type="button"
      class="DocSection-Header DocSection-Header--toggle"
      :aria-expanded="props.active"
      @click="emit('click')"
    >
      <slot name="header" />
      <span
        class="DocSection-Chevron i-carbon-chevron-down"
        :class="{ 'is-open': props.active }"
        aria-hidden="true"
      />
    </button>

    <div
      v-if="props.list > 0"
      class="DocSection-Body"
      :class="{ 'is-open': props.active }"
      :aria-hidden="!props.active"
      :inert="!props.active"
    >
      <div class="DocSection-Inner">
        <ul class="docs-nav-list">
          <slot />
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.DocSection {
  display: flex;
  flex-direction: column;
}

.DocSection--group {
  margin-top: 10px;
}

.DocSection-Header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}

.DocSection-Header--page {
  min-height: 30px;
  padding: 5px 8px 5px 10px;
  border-radius: 7px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--docs-nav-ink, var(--docs-ink-regular));
}

.DocSection-Header--page:hover {
  background: var(--docs-nav-hover, var(--docs-surface-subtle));
  color: var(--docs-ink);
}

.DocSection-Header--page.is-active {
  background: var(--docs-nav-active, var(--docs-surface-subtle));
  color: var(--docs-ink);
  font-weight: 500;
}

.DocSection-Header--page.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 2.5px;
  height: 14px;
  border-radius: 2px;
  background: var(--docs-accent, #409eff);
  transform: translateY(-50%);
}

.DocSection-Header--toggle {
  padding: 4px 8px 5px 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--docs-nav-label, var(--docs-muted));
}

.DocSection-Header--toggle:hover {
  color: var(--docs-ink);
}

.DocSection-Chevron {
  flex: none;
  font-size: 12px;
  opacity: 0.6;
  transform: rotate(-90deg);
  transition: transform 0.18s ease;
}

.DocSection-Chevron.is-open {
  transform: rotate(0deg);
}

.DocSection-Body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.2s ease;
}

.DocSection-Body.is-open {
  grid-template-rows: 1fr;
}

.DocSection-Inner {
  overflow: hidden;
  min-height: 0;
}

@media (prefers-reduced-motion: reduce) {
  .DocSection-Chevron,
  .DocSection-Body {
    transition: none;
  }
}
</style>
