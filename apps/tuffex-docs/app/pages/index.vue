<script setup lang="ts">
import { onMounted } from 'vue'
import { detectBrowserPreferredLocale } from '~/utils/docs-route'

definePageMeta({
  layout: false,
})

useHead({
  title: 'TuffEx — Tuff Design System',
  meta: [
    {
      name: 'description',
      content: 'TuffEx component library and design system documentation for Vue, React, and Web Components.',
    },
  ],
})

onMounted(() => {
  const preferred = detectBrowserPreferredLocale()
  void navigateTo(`/${preferred}`, { replace: true })
})
</script>

<template>
  <main class="tuffex-entry">
    <div class="tuffex-entry__card">
      <div class="tuffex-entry__badge">
        TuffEx
      </div>
      <h1 class="tuffex-entry__title">
        TuffEx Design System
      </h1>
      <p class="tuffex-entry__desc">
        Redirecting to your preferred language…
      </p>
      <div class="tuffex-entry__links">
        <NuxtLink to="/en" class="tuffex-entry__link">
          English Docs
        </NuxtLink>
        <NuxtLink to="/zh" class="tuffex-entry__link">
          简体中文文档
        </NuxtLink>
      </div>
    </div>
  </main>
</template>

<style scoped>
.tuffex-entry {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--docs-surface, #ffffff);
  color: var(--docs-ink, #1f2328);
}

.tuffex-entry__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
}

.tuffex-entry__badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--docs-accent, #409eff) 12%, transparent);
  color: var(--docs-accent, #409eff);
  font-size: 12px;
  font-weight: 600;
}

.tuffex-entry__title {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
}

.tuffex-entry__desc {
  margin: 0;
  font-size: 14px;
  color: var(--docs-muted, #6e7781);
}

.tuffex-entry__links {
  display: flex;
  gap: 12px;
  margin-top: 6px;
}

.tuffex-entry__link {
  display: inline-flex;
  align-items: center;
  height: 36px;
  padding: 0 18px;
  border-radius: 999px;
  background: var(--docs-surface-subtle, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--docs-border, #dcdfe6);
  color: var(--docs-ink, #1f2328);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
}

.tuffex-entry__link:hover {
  box-shadow: inset 0 0 0 1px var(--docs-accent, #409eff);
  color: var(--docs-accent, #409eff);
}
</style>
