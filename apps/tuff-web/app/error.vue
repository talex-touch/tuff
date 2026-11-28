<script setup lang="ts">
import type { NuxtError } from '#app'
import { computed } from 'vue'
import { resolveLocaleFromPath } from '~/utils/web-route'

const props = defineProps<{
  error: NuxtError
}>()

const route = useRoute()
const locale = computed(() => resolveLocaleFromPath(route.path))
const isZh = computed(() => locale.value === 'zh')
const statusCode = computed(() => props.error?.statusCode || 404)

function handleGoHome() {
  void clearError({ redirect: `/${locale.value}` })
}
</script>

<template>
  <main class="tuff-error" :aria-label="String(statusCode)">
    <div class="tuff-error__card">
      <div class="tuff-error__code">
        {{ statusCode }}
      </div>
      <h1 class="tuff-error__title">
        {{ statusCode === 404
          ? (isZh ? '页面未找到' : 'Page not found')
          : (isZh ? '页面遇到了一些问题' : 'Something went wrong') }}
      </h1>
      <p class="tuff-error__desc">
        {{ props.error?.statusMessage || (isZh ? '链接可能已移动或失效，请返回首页继续浏览。' : 'This page may have moved or is no longer available.') }}
      </p>
      <div class="tuff-error__actions">
        <button type="button" class="tuff-error__btn tuff-error__btn--primary" @click="handleGoHome">
          <span class="i-carbon-home" aria-hidden="true" />
          <span>{{ isZh ? '返回首页' : 'Back to Home' }}</span>
        </button>
        <NuxtLink :to="`/${locale}/docs`" class="tuff-error__btn">
          <span class="i-carbon-book" aria-hidden="true" />
          <span>{{ isZh ? '查看文档' : 'Browse Docs' }}</span>
        </NuxtLink>
      </div>
    </div>
  </main>
</template>

<style scoped>
.tuff-error {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--docs-surface, #ffffff);
  color: var(--docs-ink, #1f2328);
}

.tuff-error__card {
  width: 100%;
  max-width: 480px;
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

.tuff-error__code {
  font-size: 46px;
  font-weight: 700;
  line-height: 1;
  color: var(--docs-accent, #409eff);
  font-variant-numeric: tabular-nums;
}

.tuff-error__title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
}

.tuff-error__desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: var(--docs-muted, #6e7781);
}

.tuff-error__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 8px;
}

.tuff-error__btn {
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

.tuff-error__btn--primary {
  background: var(--docs-accent, #409eff);
  box-shadow: none;
  color: var(--tx-color-on-primary, #ffffff);
}
</style>
