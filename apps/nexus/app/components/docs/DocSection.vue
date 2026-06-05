<script lang="ts" setup>
import { TxAutoSizer } from '@talex-touch/tuffex/auto-sizer'
import { TxButton } from '@talex-touch/tuffex/button'

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
  <div class="DocSection flex flex-col" :class="active ? 'is-expanded' : 'is-collapsed'">
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
    <TxButton v-else variant="bare" block native-type="button" style="--fake-opacity: 0" class="DocSection-Header bg-transparent" :class="active ? 'is-active' : ''" :aria-expanded="active" @click="handleToggle">
      <span class="truncate">
        <slot name="header" />
      </span>
      <span
        class="DocSection-Indicator i-carbon-chevron-down"
        :class="active ? 'is-open' : ''"
        aria-hidden="true"
      />
    </TxButton>

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
.DocSection {
  gap: 6px;
  margin-block: 4px;
  transition: gap 0.2s ease, margin 0.2s ease;
}

.DocSection.is-collapsed {
  gap: 0;
  margin-block: 2px;
}

.DocSection-Header {
  min-height: 30px;
  padding: 6px 8px;
  border-radius: 8px;
  line-height: 1.35;
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

:global(.dark .DocSection-Header.is-active),
:global([data-theme='dark'] .DocSection-Header.is-active) {
  color: rgba(248, 250, 252, 0.95);
}

:global(.dark .DocSection-Indicator),
:global([data-theme='dark'] .DocSection-Indicator) {
  color: rgba(226, 232, 240, 0.78);
}
</style>
