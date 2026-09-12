<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const active = ref('home')
const variant = ref<'pill' | 'line' | 'block' | 'dot' | 'none'>('pill')
const size = ref<'sm' | 'md' | 'lg'>('md')

const copy = computed(() => (locale.value === 'zh'
  ? { home: '首页', search: '搜索', me: '我的', hint: '切换指示器与尺寸，再点不同的 tab 看滑块移动' }
  : { home: 'Home', search: 'Search', me: 'Me', hint: 'Switch indicator and size, then pick tabs to watch it travel' }))

const items = computed(() => [
  { value: 'home', label: copy.value.home, iconClass: 'i-carbon-home' },
  { value: 'search', label: copy.value.search, iconClass: 'i-carbon-search', badge: 3 },
  { value: 'me', label: copy.value.me, iconClass: 'i-carbon-user' },
])
</script>

<template>
  <div class="tx-demo tx-demo__col" style="gap: 14px;">
    <TxFlatRadio v-model="variant" size="sm">
      <TxFlatRadioItem value="pill" label="pill" />
      <TxFlatRadioItem value="line" label="line" />
      <TxFlatRadioItem value="block" label="block" />
      <TxFlatRadioItem value="dot" label="dot" />
      <TxFlatRadioItem value="none" label="none" />
    </TxFlatRadio>

    <TxFlatRadio v-model="size" size="sm">
      <TxFlatRadioItem value="sm" label="sm" />
      <TxFlatRadioItem value="md" label="md" />
      <TxFlatRadioItem value="lg" label="lg" />
    </TxFlatRadio>

    <div class="tab-bar-demo__frame">
      <TxTabBar
        v-model="active"
        :items="items"
        :fixed="false"
        :indicator="variant"
        :size="size"
      />
    </div>

    <div class="tx-demo__meta">
      {{ copy.hint }} — {{ active }} / {{ variant }} / {{ size }}
    </div>
  </div>
</template>

<style scoped>
.tab-bar-demo__frame {
  width: min(340px, 100%);
  overflow: hidden;
  border: 1px solid var(--tx-border-color-light, #e4e7ed);
  border-radius: 12px;
}
</style>
