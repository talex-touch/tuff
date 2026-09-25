<script lang="ts" setup>
interface Props {
  active: boolean
  link?: string
  list?: number
}

const props = withDefaults(defineProps<Props>(), {
  link: undefined,
  list: 0,
})

const emit = defineEmits<{
  (e: 'click'): void
}>()

const linkable = computed(() => props.list <= 0)

function handleToggle() {
  emit('click')
}
</script>

<template>
  <div
    class="DocSection flex flex-col"
    :class="[active ? 'is-expanded' : 'is-collapsed', linkable ? 'DocSection--page' : '']"
  >
    <NuxtLink
      v-if="linkable"
      :to="link"
      class="DocSection-Header DocSection-Header--page"
      :class="active ? 'is-active' : ''"
      @click="emit('click')"
    >
      <span class="truncate">
        <slot name="header" />
      </span>
    </NuxtLink>
    <button
      v-else
      type="button"
      class="DocSection-Header DocSection-Header--group bg-transparent"
      :class="active ? 'is-active' : ''"
      :aria-expanded="active"
      @click="handleToggle"
    >
      <span class="truncate">
        <slot name="header" />
      </span>
      <span
        class="DocSection-Indicator i-carbon-chevron-down"
        :class="active ? 'is-open' : ''"
        aria-hidden="true"
      />
    </button>

    <div
      v-if="list > 0"
      class="DocSection-Body"
      :class="active ? 'is-open' : ''"
      :aria-hidden="!active"
      :inert="!active"
    >
      <div class="DocSection-BodyInner min-h-0">
        <ul class="docs-nav-list">
          <slot />
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Group spacing is what makes the list scannable: rows inside a group sit 1px
   apart, groups sit 12px apart, so the grouping reads without rules or boxes. */
.DocSection {
  gap: 2px;
  margin-block: 12px 0;
  transition: gap 0.2s ease, margin 0.2s ease;
}

.DocSection.is-collapsed {
  gap: 0;
  margin-block: 6px 0;
}

/* Standalone page links sit tight like ordinary nav items regardless of the
   expanded/collapsed prop (which only means "route active" for them). */
.DocSection--page {
  margin-block: 0;
}

.DocSection-Header {
  position: relative;
  display: flex;
  width: 100%;
  min-height: 28px;
  align-items: center;
  gap: 4px;
  justify-content: flex-start;
  border: 0;
  padding: 4px 8px 4px 10px;
  border-radius: 7px;
  color: inherit;
  cursor: pointer;
  font: inherit;
  line-height: 1.35;
  text-align: left;
  text-decoration: none;
}

/* A click leaves no UA ring on the header; keyboard focus still shows one. */
.DocSection-Header:focus:not(:focus-visible) {
  outline: none;
}

.DocSection-Header:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: -2px;
}

/* Group headers read as small uppercase muted labels (reference: Tailwind-docs
   style). text-transform only affects latin titles; zh labels share size/color. */
.DocSection-Header--group {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--docs-nav-label, var(--tx-text-color-secondary, #909399));
}

.DocSection-Header--group:hover {
  color: var(--tx-text-color-primary, #303133);
}

/* Standalone page links are ordinary nav items, not labels: same height,
   inset, ink, fills and accent bar as `.docs-nav-link` in DocsSidebar, whose
   `--docs-nav-*` variables they inherit. */
.DocSection-Header--page {
  min-height: 30px;
  padding-block: 5px;
  font-size: 13px;
  color: var(--docs-nav-ink, var(--tx-text-color-regular, #606266));
}

.DocSection-Header--page:hover {
  color: var(--tx-text-color-primary, #303133);
  background: var(--docs-nav-hover, var(--tx-fill-color-light, #f5f7fa));
}

.DocSection-Header--page.is-active {
  color: var(--tx-text-color-primary, #303133);
  font-weight: 500;
  background: var(--docs-nav-active, var(--tx-fill-color, #f0f2f5));
}

.DocSection-Header--page.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 2px;
  height: 14px;
  border-radius: 2px;
  background: var(--tx-color-primary, #409eff);
  transform: translateY(-50%);
}

.DocSection-Indicator {
  margin-left: auto;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
  opacity: 0;
  transform: rotate(-90deg);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.DocSection-Header:hover .DocSection-Indicator,
.DocSection-Header:focus-visible .DocSection-Indicator {
  opacity: 0.7;
}

.DocSection-Indicator.is-open {
  transform: rotate(0deg);
}

.DocSection-Body {
  display: grid;
  grid-template-rows: 0fr;
  overflow: hidden;
  transition: grid-template-rows 0.2s ease;
}

.DocSection-Body.is-open {
  grid-template-rows: 1fr;
}

.DocSection-BodyInner {
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .DocSection,
  .DocSection-Indicator,
  .DocSection-Body {
    transition: none;
  }
}
</style>
