<script setup lang="ts">
import { computed } from 'vue'
import { resolveLocaleFromPath } from '~/utils/docs-route'

const route = useRoute()
const docsLocale = computed(() => resolveLocaleFromPath(route.path))
const isZh = computed(() => docsLocale.value === 'zh')
const year = new Date().getFullYear()
</script>

<template>
  <!-- R4: Pure CSS Footer — ZERO WebGL2 / TouchAurora / ogl / backdrop-filter over canvas! -->
  <footer class="docs-footer">
    <div class="docs-footer__aurora" aria-hidden="true" />
    <div class="docs-footer__inner">
      <div class="docs-footer__brand">
        <div class="docs-footer__brand-row">
          <span class="docs-footer__logo" aria-hidden="true">T</span>
          <span class="docs-footer__name">TuffEx Design System</span>
        </div>
        <p class="docs-footer__tagline">
          {{ isZh ? '面向 Vue、React 与 Web Components 的现代组件与动效体系。' : 'Modern component, surface, and motion architecture for Vue, React, and Web Components.' }}
        </p>
      </div>

      <div class="docs-footer__columns">
        <div class="docs-footer__col">
          <div class="docs-footer__col-title">
            {{ isZh ? '组件套件' : 'Suites' }}
          </div>
          <NuxtLink :to="`/${docsLocale}`" class="docs-footer__link">
            {{ isZh ? '组件总览' : 'Overview' }}
          </NuxtLink>
          <NuxtLink :to="`/${docsLocale}/base-suite`" class="docs-footer__link">
            Base Suite
          </NuxtLink>
          <NuxtLink :to="`/${docsLocale}/pro-suite`" class="docs-footer__link">
            Pro Suite
          </NuxtLink>
          <NuxtLink :to="`/${docsLocale}/ai-suite`" class="docs-footer__link">
            AI Suite
          </NuxtLink>
        </div>

        <div class="docs-footer__col">
          <div class="docs-footer__col-title">
            {{ isZh ? '生态系统' : 'Ecosystem' }}
          </div>
          <a href="/" class="docs-footer__link">
            {{ isZh ? 'Tuff 首页' : 'Tuff Home' }}
          </a>
          <a :href="`/${docsLocale}/docs`" class="docs-footer__link">
            {{ isZh ? 'Tuff 产品文档' : 'Tuff Product Docs' }}
          </a>
          <a href="/store" class="docs-footer__link">
            {{ isZh ? '插件市场' : 'Plugin Store' }}
          </a>
          <a href="/updates" class="docs-footer__link">
            {{ isZh ? '版本更新' : 'Updates' }}
          </a>
        </div>

        <div class="docs-footer__col">
          <div class="docs-footer__col-title">
            {{ isZh ? '资源' : 'Resources' }}
          </div>
          <a href="https://github.com/talex-touch/tuff" target="_blank" rel="noopener noreferrer" class="docs-footer__link">
            GitHub
          </a>
          <a href="/tuffex/llms.txt" target="_blank" rel="noopener noreferrer" class="docs-footer__link">
            llms.txt
          </a>
          <NuxtLink :to="`/${docsLocale}/concepts`" class="docs-footer__link">
            {{ isZh ? '设计理念手册' : 'Design Concepts' }}
          </NuxtLink>
        </div>
      </div>
    </div>

    <div class="docs-footer__bottom">
      <span>© {{ year }} TalexTouch · TuffEx</span>
      <span>MIT License</span>
    </div>
  </footer>
</template>

<style scoped>
.docs-footer {
  position: relative;
  overflow: hidden;
  border-top: 1px solid var(--docs-border-light, #ebeef5);
  background: var(--docs-surface, #ffffff);
  color: var(--docs-ink, #1f2328);
}

/* R4: Pure static radial-gradient wash — zero GPU shaders, zero RAF ticks */
.docs-footer__aurora {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse 65% 55% at 15% 110%, color-mix(in srgb, var(--tx-color-primary, #409eff) 9%, transparent), transparent 68%),
    radial-gradient(ellipse 55% 50% at 85% 105%, rgba(139, 92, 246, 0.07), transparent 66%);
}

.docs-footer__inner {
  position: relative;
  z-index: 1;
  margin-inline: auto;
  max-width: calc(var(--docs-frame-compact, 840px) + 236px + 240px + 4rem);
  padding: 40px var(--docs-frame-gutter, 1rem) 28px;
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 2fr);
  gap: 32px;
}

@media (max-width: 768px) {
  .docs-footer__inner {
    grid-template-columns: 1fr;
    gap: 24px;
  }
}

.docs-footer__brand {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.docs-footer__brand-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.docs-footer__logo {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: var(--docs-ink);
  color: var(--docs-surface);
  font-size: 13px;
  font-weight: 700;
}

.docs-footer__name {
  font-size: 14px;
  font-weight: 600;
}

.docs-footer__tagline {
  margin: 0;
  max-width: 34ch;
  font-size: 13px;
  line-height: 1.6;
  color: var(--docs-muted);
  text-wrap: pretty;
}

.docs-footer__columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

@media (max-width: 560px) {
  .docs-footer__columns {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.docs-footer__col {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.docs-footer__col-title {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--docs-muted);
  margin-bottom: 2px;
}

.docs-footer__link {
  font-size: 13px;
  color: var(--docs-ink-regular);
  text-decoration: none;
  width: fit-content;
}

.docs-footer__link:hover {
  color: var(--docs-accent);
}

.docs-footer__bottom {
  position: relative;
  z-index: 1;
  margin-inline: auto;
  max-width: calc(var(--docs-frame-compact, 840px) + 236px + 240px + 4rem);
  padding: 16px var(--docs-frame-gutter, 1rem) 24px;
  border-top: 1px solid var(--docs-border-light, #ebeef5);
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--docs-muted);
}
</style>
