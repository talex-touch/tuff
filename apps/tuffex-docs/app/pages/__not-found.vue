<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { detectBrowserPreferredLocale, type SupportedLocale } from '~/utils/docs-route'

definePageMeta({
  layout: false,
})

const detectedLocale = ref<SupportedLocale>('en')
const isZh = computed(() => detectedLocale.value === 'zh')
const searchOpen = useState<boolean>('tuffex-search-open', () => false)

useHead(() => ({
  title: isZh.value ? '404 — 页面未找到 | TuffEx' : '404 — Page Not Found | TuffEx',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
}))

onMounted(() => {
  const path = window.location.pathname
  if (/^\/tuffex\/zh(?:\/|$)/i.test(path))
    detectedLocale.value = 'zh'
  else if (/^\/tuffex\/en(?:\/|$)/i.test(path))
    detectedLocale.value = 'en'
  else
    detectedLocale.value = detectBrowserPreferredLocale()
})
</script>

<template>
  <main class="tuffex-404" aria-label="404">
    <div class="tuffex-404__card">
      <div class="tuffex-404__badge">
        404
      </div>
      <h1 class="tuffex-404__title">
        {{ isZh ? '找不到这个文档页面' : 'We could not find that docs page' }}
      </h1>
      <p class="tuffex-404__desc">
        {{ isZh ? '链接可能已更新或页面已移动。你可以使用快捷键搜索组件，或返回 TuffEx 文档首页。' : 'The link may be outdated or the page has moved. Try searching for a component or head back to TuffEx Docs.' }}
      </p>
      <div class="tuffex-404__actions">
        <NuxtLink :to="`/${detectedLocale}`" class="tuffex-404__btn tuffex-404__btn--primary">
          <span class="i-carbon-home" aria-hidden="true" />
          <span>{{ isZh ? 'TuffEx 文档首页' : 'TuffEx Docs Home' }}</span>
        </NuxtLink>
        <button type="button" class="tuffex-404__btn" @click="searchOpen = true">
          <span class="i-carbon-search" aria-hidden="true" />
          <span>{{ isZh ? '搜索组件' : 'Search components' }}</span>
        </button>
        <a href="/" class="tuffex-404__btn">
          <span>{{ isZh ? '返回 Tuff' : 'Back to Tuff' }}</span>
        </a>
      </div>
    </div>
  </main>
</template>

<style scoped>
.tuffex-404 {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--docs-surface, #ffffff);
  color: var(--docs-ink, #1f2328);
}

.tuffex-404__card {
  width: 100%;
  max-width: 500px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
  padding: 40px 28px;
  border-radius: 20px;
  background: var(--docs-surface-subtle, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--docs-border-light, #ebeef5);
}

.tuffex-404__badge {
  font-size: 46px;
  font-weight: 700;
  line-height: 1;
  color: var(--docs-accent, #409eff);
  font-variant-numeric: tabular-nums;
}

.tuffex-404__title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  text-wrap: balance;
}

.tuffex-404__desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: var(--docs-muted, #6e7781);
  text-wrap: pretty;
}

.tuffex-404__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 8px;
}

.tuffex-404__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  background: var(--docs-surface, #ffffff);
  box-shadow: inset 0 0 0 1px var(--docs-border, #dcdfe6);
  color: var(--docs-ink, #1f2328);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
}

.tuffex-404__btn--primary {
  background: var(--docs-accent, #409eff);
  box-shadow: none;
  color: var(--tx-color-on-primary, #ffffff);
}
</style>
