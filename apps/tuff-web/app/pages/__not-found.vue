<script setup lang="ts">
import { hasWindow } from '@talex-touch/utils/env'
import { computed, onMounted, ref } from 'vue'
import { detectBrowserPreferredLocale, type SupportedLocale } from '~/utils/web-route'

definePageMeta({
  layout: false,
})

const detectedLocale = ref<SupportedLocale>('en')
const isZh = computed(() => detectedLocale.value === 'zh')
const searchOpen = useState<boolean>('tuff-web-search-open', () => false)

useHead(() => ({
  title: isZh.value ? '404 — 页面未找到 | Tuff' : '404 — Page Not Found | Tuff',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
}))

onMounted(() => {
  if (!hasWindow())
    return
  const path = window.location.pathname
  if (/^\/zh(?:\/|$)/i.test(path))
    detectedLocale.value = 'zh'
  else if (/^\/en(?:\/|$)/i.test(path))
    detectedLocale.value = 'en'
  else
    detectedLocale.value = detectBrowserPreferredLocale()
})
</script>

<template>
  <main class="tuff-404" aria-label="404">
    <div class="tuff-404__card">
      <div class="tuff-404__badge">
        404
      </div>
      <h1 class="tuff-404__title">
        {{ isZh ? '找不到这个页面' : 'We could not find that page' }}
      </h1>
      <p class="tuff-404__desc">
        {{ isZh ? '链接可能已更新或页面已移动。你可以使用快捷键搜索文档，或返回 Tuff 首页。' : 'The link may be outdated or the page has moved. Try searching docs or head back to Tuff.' }}
      </p>
      <div class="tuff-404__actions">
        <NuxtLink :to="`/${detectedLocale}`" class="tuff-404__btn tuff-404__btn--primary">
          <span class="i-carbon-home" aria-hidden="true" />
          <span>{{ isZh ? '返回首页' : 'Tuff Home' }}</span>
        </NuxtLink>
        <NuxtLink :to="`/${detectedLocale}/docs`" class="tuff-404__btn">
          <span class="i-carbon-book" aria-hidden="true" />
          <span>{{ isZh ? '浏览文档' : 'Browse Docs' }}</span>
        </NuxtLink>
        <button type="button" class="tuff-404__btn" @click="searchOpen = true">
          <span class="i-carbon-search" aria-hidden="true" />
          <span>{{ isZh ? '搜索文档' : 'Search docs' }}</span>
        </button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.tuff-404 {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--docs-surface, #ffffff);
  color: var(--docs-ink, #1f2328);
}

.tuff-404__card {
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

.tuff-404__badge {
  font-size: 46px;
  font-weight: 700;
  line-height: 1;
  color: var(--docs-accent, #409eff);
  font-variant-numeric: tabular-nums;
}

.tuff-404__title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
}

.tuff-404__desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: var(--docs-muted, #6e7781);
}

.tuff-404__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 8px;
}

.tuff-404__btn {
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

.tuff-404__btn--primary {
  background: var(--docs-accent, #409eff);
  box-shadow: none;
  color: var(--tx-color-on-primary, #ffffff);
}
</style>
