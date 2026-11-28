<script setup lang="ts">
import { computed } from 'vue'

const { t, locale } = useI18n()
const isZh = computed(() => locale.value === 'zh')

const resourceLinks = computed(() => [
  {
    label: t('docs.aside.reportIssue', isZh.value ? '反馈问题' : 'Report an issue'),
    icon: 'i-carbon-flag',
    href: 'https://github.com/talex-touch/tuff/issues/new/choose',
  },
  {
    label: t('docs.aside.requestFeature', isZh.value ? '功能建议' : 'Request a feature'),
    icon: 'i-carbon-add',
    href: 'https://github.com/talex-touch/tuff/discussions',
  },
  {
    label: t('docs.aside.viewGitHub', isZh.value ? '查看 GitHub' : 'View on GitHub'),
    icon: 'i-carbon-logo-github',
    href: 'https://github.com/talex-touch/tuff',
  },
])
</script>

<template>
  <section class="docs-aside-cards">
    <div class="docs-aside-card">
      <div class="docs-aside-card__title">
        {{ t('docs.aside.resources', isZh ? '相关资源' : 'Resources') }}
      </div>
      <ul class="docs-aside-card__list">
        <li v-for="link in resourceLinks" :key="link.href">
          <a class="docs-aside-card__link" :href="link.href" target="_blank" rel="noopener noreferrer">
            <span class="docs-aside-card__link-icon" :class="link.icon" aria-hidden="true" />
            <span>{{ link.label }}</span>
          </a>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.docs-aside-cards {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.docs-aside-card__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--docs-muted);
}

.docs-aside-card__list {
  list-style: none;
  padding: 10px 0 0;
  margin: 0;
  display: grid;
  gap: 8px;
}

.docs-aside-card__link {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--docs-muted);
  text-decoration: none;
}

.docs-aside-card__link:hover {
  color: var(--docs-ink);
}

.docs-aside-card__link-icon {
  font-size: 14px;
  opacity: 0.85;
}
</style>
