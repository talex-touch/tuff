<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const value = ref('home')

const labels = computed(() => (locale.value === 'zh'
  ? {
      active: '当前页',
      home: '首页',
      search: '搜索',
      profile: '我的',
    }
  : {
      active: 'Active',
      home: 'Home',
      search: 'Search',
      profile: 'Me',
    }))

const items = computed(() => [
  { value: 'home', label: labels.value.home, iconClass: 'i-carbon-home' },
  { value: 'search', label: labels.value.search, iconClass: 'i-carbon-search', badge: 3 },
  { value: 'profile', label: labels.value.profile, iconClass: 'i-carbon-user' },
])
</script>

<template>
  <div class="tab-bar-demo-frame">
    <div class="tab-bar-demo-frame__body">
      {{ labels.active }}: {{ value }}
    </div>

    <TxTabBar v-model="value" :items="items" :fixed="false" />
  </div>
</template>

<style scoped>
.tab-bar-demo-frame {
  position: relative;
  width: min(360px, 100%);
  height: 220px;
  overflow: hidden;
  border: 1px solid var(--tx-border-color);
  border-radius: 12px;
}

.tab-bar-demo-frame__body {
  padding: 16px;
  color: var(--tx-text-color-secondary);
}
</style>
