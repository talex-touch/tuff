<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

type Strength = 'strong' | 'weak' | 'veryweak' | 'none'

interface Company {
  id: string
  name: string
  tags: string[]
  /**
   * Epoch milliseconds, not the rendered "9 days ago". The upstream table sorts
   * that column with `localeCompare` over human-readable strings, which puts
   * "over 1 year ago" between "3 weeks ago" and "9 days ago" and calls it a
   * chronology. Sorting reads this field; the column only formats it.
   */
  lastAt: number | null
  strength: Strength
  website?: string
}

const DAY = 86_400_000
const NOW = Date.UTC(2026, 7, 15)

const STRENGTH_RANK: Record<Strength, number> = { strong: 3, weak: 2, veryweak: 1, none: 0 }
const STRENGTH_TONE: Record<Strength, string> = {
  strong: 'var(--tx-bui-green, #189a4d)',
  weak: 'var(--tx-bui-orange, #ef720c)',
  veryweak: 'var(--tx-bui-red, #e3474c)',
  none: 'var(--tx-bui-ink-3, #9a9da3)',
}

const TAG_COLORS: Record<string, string> = {
  B2B: '#f09a2f',
  B2C: '#92b72d',
  Cafe: '#ee6572',
  Catering: '#c84f9d',
  Gelato: '#9a5cff',
  Imports: '#3f78ff',
  Local: '#25a878',
  Seasonal: '#f09a2f',
  Sorbet: '#16a6c7',
  Vegan: '#92b72d',
  Wholesale: '#3f78ff',
}

const rows: Company[] = [
  { id: 'aurora', name: 'Aurora Scoops', tags: ['B2C', 'Local', 'Gelato'], lastAt: NOW - 9 * DAY, strength: 'strong', website: 'aurora-scoops.example' },
  { id: 'kumo', name: 'Kumo Creamery', tags: ['Wholesale', 'Imports'], lastAt: NOW - 3 * DAY, strength: 'strong', website: 'kumo-creamery.example' },
  { id: 'maple', name: 'Maple Orbit', tags: ['B2B', 'Seasonal', 'Sorbet', 'Vegan', 'Local'], lastAt: NOW - 24 * DAY, strength: 'weak', website: 'maple-orbit.example' },
  { id: 'coral', name: 'Coral Coast Sorbet', tags: ['Sorbet', 'B2C'], lastAt: NOW - 61 * DAY, strength: 'veryweak', website: 'coral-coast.example' },
  { id: 'mango', name: 'Mango Moon Gelato', tags: ['Gelato', 'Cafe'], lastAt: NOW - 2 * DAY, strength: 'strong', website: 'mango-moon.example' },
  { id: 'sesame', name: 'Black Sesame Co.', tags: ['Imports', 'Wholesale'], lastAt: NOW - 140 * DAY, strength: 'veryweak' },
  { id: 'pistachio', name: 'Pistachio Union', tags: ['B2B', 'Catering'], lastAt: NOW - 17 * DAY, strength: 'weak', website: 'pistachio-union.example' },
  { id: 'waffle', name: 'Waffle Works', tags: ['Cafe', 'Local'], lastAt: null, strength: 'none' },
  { id: 'vanilla', name: 'Vanilla Vault', tags: ['Imports'], lastAt: NOW - 410 * DAY, strength: 'veryweak', website: 'vanilla-vault.example' },
  { id: 'ripple', name: 'Ripple Dairy', tags: ['Wholesale', 'B2B', 'Local'], lastAt: NOW - 31 * DAY, strength: 'weak', website: 'ripple-dairy.example' },
  { id: 'frost', name: 'Frostline Supply', tags: ['Catering'], lastAt: null, strength: 'none' },
  { id: 'lychee', name: 'Lychee Lane', tags: ['Seasonal', 'Vegan'], lastAt: NOW - 74 * DAY, strength: 'veryweak', website: 'lychee-lane.example' },
]

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      columns: { name: '公司', tags: '分类', last: '最近联系', strength: '关系强度', links: '链接' },
      strengths: { strong: '非常紧密', weak: '一般', veryweak: '较弱', none: '无往来' } as Record<Strength, string>,
      noContact: '暂无联系',
      count: '条记录',
      average: '平均强度',
      links: '个链接',
      openLabel: (name: string) => `打开 ${name} 官网`,
    }
  }

  return {
    columns: { name: 'Company', tags: 'Categories', last: 'Last interaction', strength: 'Connection strength', links: 'Links' },
    strengths: { strong: 'Very strong', weak: 'Weak', veryweak: 'Very weak', none: 'No communication' } as Record<Strength, string>,
    noContact: 'No contact',
    count: 'count',
    average: 'average',
    links: 'links',
    openLabel: (name: string) => `Open the ${name} website`,
  }
})

const relativeFormatter = computed(() =>
  new Intl.RelativeTimeFormat(locale.value === 'zh' ? 'zh-CN' : 'en-US', { numeric: 'auto' }),
)

function formatLast(value: number | null): string {
  if (value == null)
    return copy.value.noContact
  const days = Math.round((value - NOW) / DAY)
  if (Math.abs(days) < 30)
    return relativeFormatter.value.format(days, 'day')
  if (Math.abs(days) < 365)
    return relativeFormatter.value.format(Math.round(days / 30), 'month')
  return relativeFormatter.value.format(Math.round(days / 365), 'year')
}

const columns = computed(() => [
  { key: 'name', title: copy.value.columns.name, width: 240, fixed: 'left' as const, nowrap: true },
  { key: 'tags', title: copy.value.columns.tags, width: 260 },
  {
    key: 'lastAt',
    title: copy.value.columns.last,
    width: 180,
    sortable: true,
    // Rows without contact sink to the bottom instead of pretending to be the
    // oldest interaction.
    sorter: (a: Company, b: Company) => (a.lastAt ?? -Infinity) - (b.lastAt ?? -Infinity),
  },
  {
    key: 'strength',
    title: copy.value.columns.strength,
    width: 200,
    sortable: true,
    sorter: (a: Company, b: Company) => STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength],
  },
  { key: 'website', title: copy.value.columns.links, width: 190 },
])

const selectedKeys = ref<string[]>(['kumo', 'maple'])
const sort = ref<{ key: string, order: 'asc' | 'desc' | null } | null>({ key: 'lastAt', order: 'desc' })

const linkCount = computed(() => rows.filter(row => row.website).length)
const averagePercent = computed(() => {
  const total = rows.reduce((sum, row) => sum + STRENGTH_RANK[row.strength], 0)
  return Math.round((total / (rows.length * 3)) * 100)
})

function openSite(href: string): void {
  // The component never navigates on its own; the host decides. In the docs
  // site a new tab is the right call, in the desktop shell it would not be.
  window.open(`https://${href}`, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div class="records-demo">
    <TxDataTable
      v-model:selected-keys="selectedKeys"
      :columns="columns"
      :data="rows"
      :sort="sort"
      row-key="id"
      selectable
      highlight-selected
      table-layout="fixed"
      nowrap
      sort-cycle="bi"
      :max-height="380"
      scroll-x
      sticky-header
      sticky-footer
      @update:sort="sort = $event"
    >
      <template #cell-tags="{ value }">
        <span class="records-demo__tags">
          <TxTag
            v-for="tag in (value as string[]).slice(0, 3)"
            :key="tag"
            :label="tag"
            :color="TAG_COLORS[tag] ?? '#7f858d'"
            :dot="TAG_COLORS[tag] ?? '#7f858d'"
            :dot-size="5"
            variant="soft"
          />
          <TxTag v-if="(value as string[]).length > 3" :label="`+${(value as string[]).length - 3}`" variant="plain" />
        </span>
      </template>

      <template #cell-lastAt="{ value }">
        <span :class="{ 'records-demo__muted': value == null }">{{ formatLast(value as number | null) }}</span>
      </template>

      <template #cell-strength="{ row }">
        <TxDotIndicator
          :color="STRENGTH_TONE[(row as Company).strength]"
          :label="copy.strengths[(row as Company).strength]"
        />
      </template>

      <template #cell-website="{ row, value }">
        <TxCellLink
          v-if="value"
          :href="`https://${value}`"
          :label="value as string"
          :aria-label="copy.openLabel((row as Company).name)"
          external
          @open="openSite(value as string)"
        />
        <span v-else class="records-demo__muted">—</span>
      </template>

      <template #footer-name>
        <strong>{{ rows.length }}</strong> {{ copy.count }}
      </template>
      <template #footer-strength>
        <TxDotIndicator
          color="var(--tx-bui-orange, #ef720c)"
          :label="`${averagePercent}% ${copy.average}`"
        />
      </template>
      <template #footer-website>
        {{ linkCount }} {{ copy.links }}
      </template>
    </TxDataTable>
  </div>
</template>

<style scoped>
/* The table owns its scroll container via `max-height`, so the sticky header
   and footer anchor to it and never depend on an ancestor scroller. */
.records-demo {
  width: 100%;

  /* Records tables read as neutral paper, not as an accent-tinted list — the
     component exposes the hover and selection fills as variables so this does
     not need a prop or an `!important`. */
  --tx-data-table-row-hover-bg: var(--tx-bui-hover, #f4f5f6);
  --tx-data-table-row-selected-bg: color-mix(in srgb, var(--tx-bui-accent, #0285ff) 7%, var(--tx-bui-surface, #fff));
}

.records-demo__tags {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.records-demo__muted {
  color: var(--tx-text-color-placeholder);
}
</style>
