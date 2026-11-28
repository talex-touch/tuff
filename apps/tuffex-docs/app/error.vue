<script setup lang="ts">
import type { NuxtError } from '#app'
import { computed } from 'vue'
import { resolveLocaleFromPath } from '~/utils/docs-route'

const props = defineProps<{
  error: NuxtError
}>()

const route = useRoute()
const activeLocale = computed(() => resolveLocaleFromPath(route.path))
const isZh = computed(() => activeLocale.value === 'zh')
const statusCode = computed(() => props.error?.statusCode || 404)

function handleBackToDocs() {
  clearError({ redirect: `/${activeLocale.value}` })
}
</script>

<template>
  <div class="tuffex-error">
    <div class="tuffex-error__card">
      <div class="tuffex-error__code">
        {{ statusCode }}
      </div>
      <h1 class="tuffex-error__title">
        {{ isZh ? '页面未找到或暂时不可用' : 'Page not found or unavailable' }}
      </h1>
      <p class="tuffex-error__desc">
        {{ props.error?.statusMessage || (isZh ? '你访问的 TuffEx 文档页面不存在或已迁移。' : 'The TuffEx documentation page you requested does not exist or has moved.') }}
      </p>
      <div class="tuffex-error__actions">
        <button type="button" class="tuffex-error__btn tuffex-error__btn--primary" @click="handleBackToDocs">
          <span class="i-carbon-arrow-left" aria-hidden="true" />
          {{ isZh ? '返回 TuffEx 文档' : 'Back to TuffEx Docs' }}
        </button>
        <a href="/" class="tuffex-error__btn">
          {{ isZh ? '返回 Tuff 首页' : 'Back to Tuff Home' }}
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tuffex-error {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--tx-bg-color, #ffffff);
  color: var(--tx-text-color-primary, #1f2328);
}

.tuffex-error__card {
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
  padding: 36px 28px;
  border-radius: 20px;
  background: var(--tx-fill-color-light, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
}

.tuffex-error__code {
  font-size: 44px;
  font-weight: 700;
  line-height: 1;
  color: var(--tx-color-primary, #409eff);
  font-variant-numeric: tabular-nums;
}

.tuffex-error__title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  text-wrap: balance;
}

.tuffex-error__desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--tx-text-color-secondary, #6e7781);
  text-wrap: pretty;
}

.tuffex-error__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 8px;
}

.tuffex-error__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  background: var(--tx-bg-color, #ffffff);
  box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6);
  color: var(--tx-text-color-primary, #1f2328);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
}

.tuffex-error__btn--primary {
  background: var(--tx-color-primary, #409eff);
  box-shadow: none;
  color: var(--tx-color-on-primary, #ffffff);
}
</style>
