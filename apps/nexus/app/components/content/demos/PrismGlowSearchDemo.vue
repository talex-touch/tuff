<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

// A stand-in for a real search: the glow is on while it runs and fades out when it ends.
const SEARCH_MS = 2400

const query = ref('')
const searching = ref(false)
const finished = ref(false)
let timer: number | undefined

const copy = computed(() => zh.value
  ? {
      placeholder: '搜索应用、文件与命令',
      search: '搜索',
      searching: '正在搜索',
      done: '搜索完成',
      hint: '按 Enter 或点「搜索」：光效亮起约 2.4 秒，然后淡出。',
    }
  : {
      placeholder: 'Search apps, files and commands',
      search: 'Search',
      searching: 'Searching',
      done: 'Search finished',
      hint: 'Press Enter or Search: the glow lights for about 2.4 s, then fades out.',
    })

// TxPrismGlow announces nothing. Saying what is happening is the host's job.
const status = computed(() => {
  if (searching.value)
    return copy.value.searching
  return finished.value ? copy.value.done : ''
})

function search() {
  searching.value = true
  finished.value = false
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    searching.value = false
    finished.value = true
  }, SEARCH_MS)
}

onBeforeUnmount(() => window.clearTimeout(timer))
</script>

<template>
  <div class="prism-search not-prose">
    <form class="prism-search__bar" role="search" @submit.prevent="search">
      <!-- Overlay usage: no slot, absolutely positioned behind the bar's content. -->
      <TxPrismGlow class="prism-search__glow" :active="searching" />
      <span class="prism-search__icon i-carbon-search" aria-hidden="true" />
      <input
        v-model="query"
        class="prism-search__input"
        type="text"
        enterkeyhint="search"
        :placeholder="copy.placeholder"
        :aria-label="copy.placeholder"
      >
      <TxButton native-type="submit" size="sm" variant="primary">
        {{ copy.search }}
      </TxButton>
    </form>
    <p class="prism-search__hint">
      {{ copy.hint }}
    </p>
    <span class="prism-search__status" role="status">{{ status }}</span>
  </div>
</template>

<style scoped>
.prism-search {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
}

/* The bar is a stacking context, so the glow's z-index: -1 lands on the bar's
   background and under the input, never behind the bar. */
.prism-search__bar {
  position: relative;
  z-index: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 56px;
  padding: 0 10px 0 16px;
  border-radius: 14px;
  background: var(--tx-bg-color-overlay, #fff);
  box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6);
}

.prism-search__bar:focus-within {
  box-shadow:
    inset 0 0 0 1.5px var(--tx-color-primary, #409eff),
    0 0 0 3px var(--tx-color-primary-light-9, #ecf5ff);
}

/* The root's own `position: relative` has zero specificity, so this wins in any load order. */
.prism-search__glow {
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
}

.prism-search__icon {
  flex: none;
  width: 18px;
  height: 18px;
  color: var(--tx-text-color-secondary, #909399);
}

.prism-search__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  font-size: 14px;
  color: var(--tx-text-color-primary, #303133);
}

.prism-search__input::placeholder {
  color: var(--tx-text-color-placeholder, #a8abb2);
}

.prism-search__hint {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.prism-search__status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
</style>
