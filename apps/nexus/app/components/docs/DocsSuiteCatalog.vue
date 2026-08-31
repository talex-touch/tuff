<script setup lang="ts">
import type { DocsSuiteKey } from '~/utils/docs-suites'
import { computed } from 'vue'
import { coerceJsonArray } from '~/utils/docs-api'
import { categoryI18nKey, SUITE_CATEGORY_KEYS } from '~/utils/docs-suites'
import { useTypedFetch } from '~/utils/request'
import { resolveDocsLocaleFromRoute, toLocalizedDocsPath } from '#shared/utils/docs-path'

/**
 * The complete component list for one suite, grouped by category.
 *
 * Reads the same `/api/docs/sidebar-components` feed the sidebar uses, so it
 * always shows every doc that carries a category in this suite — there is no
 * hand-maintained list to fall behind.
 */
const props = defineProps<{ suite: DocsSuiteKey }>()

interface CatalogDoc {
  title: string
  normalizedPath: string
  category: string | null
}

const route = useRoute()
const { t } = useI18n()
const docsLocale = computed(() => resolveDocsLocaleFromRoute(route.path))

// Mirrors the sidebar's client-only lazy fetch: the docs pages prerender, and
// the content table is not reliably queryable at that point.
const { data: payload, pending } = await useTypedFetch<unknown>(
  computed(() => `/api/docs/sidebar-components/${docsLocale.value}`),
  {
    key: computed(() => `docs-suite-catalog:${docsLocale.value}`),
    server: false,
    lazy: true,
    responseType: 'json',
    default: () => [],
  },
)

const categoryKeys = computed(() => SUITE_CATEGORY_KEYS[props.suite] ?? [])

const groups = computed(() => {
  const docs = coerceJsonArray<CatalogDoc>(payload.value)
  return categoryKeys.value
    .map(key => ({
      key,
      label: t(`docsSidebar.categories.${categoryI18nKey(key)}`),
      // Alphabetical rather than the sidebar's curated order: this list exists
      // to be exhaustive and scannable, and it stays correct as docs are added.
      items: docs
        .filter(doc => doc.category === key)
        .sort((a, b) => a.title.localeCompare(b.title, docsLocale.value)),
    }))
    .filter(group => group.items.length > 0)
})

const total = computed(() => groups.value.reduce((sum, group) => sum + group.items.length, 0))
</script>

<template>
  <section class="docs-suite-catalog" :aria-busy="pending || undefined">
    <p v-if="!pending && total > 0" class="docs-suite-catalog__total">
      {{ t('docsSuiteCatalog.total', { count: total, groups: groups.length }) }}
    </p>

    <!-- Skeleton mirrors the loaded layout so nothing shifts when data lands. -->
    <div v-if="pending" class="docs-suite-catalog__groups" aria-hidden="true">
      <div v-for="key in categoryKeys" :key="key" class="docs-suite-catalog__group">
        <div class="docs-suite-catalog__skeleton-heading" />
        <div class="docs-suite-catalog__grid">
          <div v-for="n in 6" :key="n" class="docs-suite-catalog__skeleton-chip" />
        </div>
      </div>
    </div>

    <div v-else class="docs-suite-catalog__groups">
      <div v-for="group in groups" :key="group.key" class="docs-suite-catalog__group">
        <h3 class="docs-suite-catalog__heading">
          {{ group.label }}
          <span class="docs-suite-catalog__count">{{ group.items.length }}</span>
        </h3>
        <ul class="docs-suite-catalog__grid">
          <li v-for="item in group.items" :key="item.normalizedPath">
            <NuxtLink
              class="docs-suite-catalog__chip"
              :to="toLocalizedDocsPath(item.normalizedPath, docsLocale)"
            >
              {{ item.title }}
            </NuxtLink>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.docs-suite-catalog {
  margin: 20px 0 8px;
}

.docs-suite-catalog__total {
  margin: 0 0 16px;
  color: var(--tx-text-color-secondary);
  font-size: 13px;
}

.docs-suite-catalog__groups {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.docs-suite-catalog__heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.docs-suite-catalog__count {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--tx-fill-color);
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.docs-suite-catalog__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.docs-suite-catalog__chip {
  display: block;
  padding: 8px 12px;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 10px;
  color: var(--tx-text-color-regular);
  font-size: 13px;
  line-height: 1.35;
  text-decoration: none;
  transition: border-color 0.18s ease, color 0.18s ease, background-color 0.18s ease;
}

.docs-suite-catalog__chip:hover {
  border-color: var(--tx-color-primary);
  color: var(--tx-color-primary);
  background: var(--tx-color-primary-light-9);
}

.docs-suite-catalog__skeleton-heading,
.docs-suite-catalog__skeleton-chip {
  border-radius: 10px;
  background: var(--tx-fill-color);
  animation: docs-suite-catalog-pulse 1.4s ease-in-out infinite;
}

.docs-suite-catalog__skeleton-heading {
  width: 120px;
  height: 18px;
  margin: 0 0 10px;
  border-radius: 6px;
}

.docs-suite-catalog__skeleton-chip {
  height: 35px;
}

@keyframes docs-suite-catalog-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

@media (prefers-reduced-motion: reduce) {
  .docs-suite-catalog__skeleton-heading,
  .docs-suite-catalog__skeleton-chip {
    animation: none;
  }
}
</style>
