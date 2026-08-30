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
.DocSection {
  gap: 4px;
  margin-block: 8px;
  transition: gap 0.2s ease, margin 0.2s ease;
}

.DocSection.is-collapsed {
  gap: 0;
  margin-block: 4px;
}

/* Standalone page links sit tight like ordinary nav items regardless of the
   expanded/collapsed prop (which only means "route active" for them). */
.DocSection--page {
  margin-block: 0;
}

.DocSection-Header {
  display: flex;
  width: 100%;
  min-height: 28px;
  align-items: center;
  gap: 4px;
  justify-content: flex-start;
  border: 0;
  padding: 4px 2px;
  border-radius: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
  line-height: 1.35;
  text-align: left;
  text-decoration: none;
}

/* Click focus otherwise leaves the UA blue focus ring on the header. */
.DocSection-Header:focus,
.DocSection-Header:focus-visible {
  outline: none;
}

/* Group headers read as small uppercase muted labels (reference: Tailwind-docs
   style). text-transform only affects latin titles; zh labels share size/color. */
.DocSection-Header--group {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(15, 23, 42, 0.4);
}

.DocSection-Header--group:hover {
  color: rgba(15, 23, 42, 0.62);
}

/* Standalone page links are ordinary nav items, not labels. */
.DocSection-Header--page {
  font-size: 13px;
  padding-block: 5px;
  color: rgba(15, 23, 42, 0.6);
  transition: color 0.2s ease;
}

.DocSection-Header--page:hover {
  color: rgba(15, 23, 42, 0.88);
}

.DocSection-Header--page.is-active {
  color: rgba(15, 23, 42, 0.96);
  font-weight: 600;
}

.DocSection-Indicator {
  margin-left: auto;
  font-size: 12px;
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

:global(.dark .DocSection-Header--group),
:global([data-theme='dark'] .DocSection-Header--group) {
  color: rgba(226, 232, 240, 0.4);
}

:global(.dark .DocSection-Header--group:hover),
:global([data-theme='dark'] .DocSection-Header--group:hover) {
  color: rgba(226, 232, 240, 0.62);
}

:global(.dark .DocSection-Header--page),
:global([data-theme='dark'] .DocSection-Header--page) {
  color: rgba(226, 232, 240, 0.58);
}

:global(.dark .DocSection-Header--page:hover),
:global([data-theme='dark'] .DocSection-Header--page:hover) {
  color: rgba(226, 232, 240, 0.85);
}

:global(.dark .DocSection-Header--page.is-active),
:global([data-theme='dark'] .DocSection-Header--page.is-active) {
  color: rgba(248, 250, 252, 0.96);
}

:global(.dark .DocSection-Indicator),
:global([data-theme='dark'] .DocSection-Indicator) {
  color: rgba(226, 232, 240, 0.78);
}
</style>
