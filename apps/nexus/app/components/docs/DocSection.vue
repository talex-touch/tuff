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
const { sizerRef, runWithAutoSizer } = useAutoSizerAction()

function handleToggle() {
  void runWithAutoSizer(() => {
    emit('click')
  })
}
</script>

<template>
  <div class="DocSection flex flex-col gap-2">
    <NuxtLink
      v-if="linkable"
      :to="link"
      class="DocSection-Header"
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
      class="DocSection-Header"
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

    <TxAutoSizer
      v-if="list > 0"
      ref="sizerRef"
      :width="false"
      :height="true"
      :duration-ms="200"
      outer-class="DocSection-Body overflow-hidden"
      inner-class="DocSection-BodyInner min-h-0"
    >
      <div v-show="active && list > 0">
        <ul class="docs-nav-list">
          <slot />
        </ul>
      </div>
    </TxAutoSizer>
  </div>
</template>

<style scoped>
.DocSection-Header {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 2px 0;
  border: 0;
  background: transparent;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: rgba(15, 23, 42, 0.68);
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s ease;
}

.DocSection-Header:hover {
  color: rgba(15, 23, 42, 0.85);
}

.DocSection-Header.is-active {
  color: rgba(15, 23, 42, 0.92);
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

:global(.dark .DocSection-Header),
:global([data-theme='dark'] .DocSection-Header) {
  color: rgba(226, 232, 240, 0.7);
}

:global(.dark .DocSection-Header:hover),
:global([data-theme='dark'] .DocSection-Header:hover) {
  color: rgba(248, 250, 252, 0.86);
}

:global(.dark .DocSection-Header.is-active),
:global([data-theme='dark'] .DocSection-Header.is-active) {
  color: rgba(248, 250, 252, 0.95);
}

:global(.dark .DocSection-Indicator),
:global([data-theme='dark'] .DocSection-Indicator) {
  color: rgba(226, 232, 240, 0.78);
}
</style>
