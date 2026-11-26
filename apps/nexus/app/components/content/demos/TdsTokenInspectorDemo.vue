<script setup lang="ts">
import { computed, ref } from 'vue'
import ConceptFigure from './ConceptFigure.vue'
import {
  TDS_BACKDROPS,
  TDS_CONVERGENCE_MAPPINGS,
  TDS_CORE_PRIMITIVES,
  TDS_PRIMITIVE_CATEGORIES,
  TDS_REFRACTION_OPACITY,
  TDS_THEME_KEYS,
  TDS_TOKENS,
  evaluateRefractionContrast,
  filterCorePrimitives,
  getThemeRampSwatches,
  getThemeSelector,
  type TdsBackdropKey,
  type TdsPrimitiveCategory,
  type TdsSurfaceMode,
  type TdsThemeKey,
} from '~/utils/tds-inspector'

const props = withDefaults(defineProps<{
  initialTheme?: TdsThemeKey
  initialSurface?: TdsSurfaceMode
  initialBackdrop?: TdsBackdropKey
  initialCategory?: TdsPrimitiveCategory | 'all'
  initialQuery?: string
}>(), {
  initialTheme: 'dark',
  initialSurface: 'refraction',
  initialBackdrop: 'dark',
  initialCategory: 'all',
  initialQuery: '',
})

const { locale } = useI18n()
const isZh = computed(() => locale.value === 'zh')

const activeTheme = ref<TdsThemeKey>(props.initialTheme)
const surfaceMode = ref<TdsSurfaceMode>(props.initialSurface)
const backdropKey = ref<TdsBackdropKey>(props.initialBackdrop)
const activeCategory = ref<TdsPrimitiveCategory | 'all'>(props.initialCategory)
const searchQuery = ref(props.initialQuery)

const copy = computed(() => isZh.value
  ? {
      sourceLabel: '单一真相源',
      themeLabel: '主题色阶',
      themes: {
        light: '浅色 Light',
        dark: '暗色 Dark',
        highContrastLight: '高对比浅色 HC Light',
        highContrastDark: '高对比暗色 HC Dark',
      } as Record<TdsThemeKey, string>,
      swatchesTitle: '壳层语义色板与 --shell-* / --tx-* 收敛映射',
      swatchesHint: '所有色值直接从 docs/design/tds/tokens.json 实时解析，无手工重复表。',
      convergenceTitle: '--shell-* ↔ --tx-* 收敛状态',
      colRole: '职责',
      colShell: 'CoreApp (--shell-*)',
      colTuffex: 'TuffEx (--tx-*)',
      colStatus: '状态',
      statusLabels: {
        'aligned': '已对齐',
        'near-aligned': '近对齐',
        'aliased': '已桥接',
        'converged-in-high-contrast': '高对比收敛',
        'converged-in-hc-dark': '暗色高对比收敛',
        'intentional-divergence': '有意分歧',
      } as Record<string, string>,
      contrastTitle: 'Refraction 材质表面对比度实时检验（WCAG 2.1）',
      surfaceLabel: '材质模式',
      surfaceOpaque: '实色不透明 (1.00)',
      surfaceRefraction: `琉光折射玻璃 (${TDS_REFRACTION_OPACITY.toFixed(2)})`,
      backdropLabel: '桌面壁纸底色',
      backdropLight: `浅色壁纸 ${TDS_BACKDROPS.light.hex}`,
      backdropDark: `暗色壁纸 ${TDS_BACKDROPS.dark.hex}`,
      sampleText: '正文 Aa',
      minContract: '门禁',
      deltaOpaque: '较实色',
      summaryPassing: '项满足合同下限',
      summaryMinRatio: '最低实测对比度',
      summaryAaaCount: '项达到 AAA (≥7:1)',
      coreTitle: 'TDS Core 36 正交原语矩阵',
      searchLabel: '筛选原语',
      searchPlaceholder: '按模块 slug、组件名或职责搜索（如 button / stream）',
      allCategory: '全部',
      categories: {
        surface: '表面与布局',
        display: '排版与展示',
        data: '数据与指标',
        form: '表单与控件',
        navigation: '导航与命令',
        overlay: '浮层与反馈',
        ai: 'AI 核心',
      } as Record<TdsPrimitiveCategory, string>,
      emptyPrimitives: '没有匹配的 Core 原语，清空关键词以查看全部 36 项。',
      showingCount: (shown: number, total: number) => `显示 ${shown} / ${total}`,
      openDoc: '打开组件文档',
      caption: `单一真相源版本 v${TDS_TOKENS.meta.version}（默认材质 ${TDS_TOKENS.materials.defaultSurface}，正文基准 ${TDS_TOKENS.meta.rules.bodyFontSizePx.join('–')}px，悬停变色 ${TDS_TOKENS.meta.rules.hoverColorTransitionMs}ms）。本检视器直接读取 docs/design/tds/tokens.json，实时演示四套主题色阶、0.85 折射玻璃跨壁纸 WCAG 2.1 对比度以及 36 个核心原语入口。`,
    }
  : {
      sourceLabel: 'Single Source of Truth',
      themeLabel: 'Theme ramp',
      themes: {
        light: 'Light',
        dark: 'Dark',
        highContrastLight: 'HC Light',
        highContrastDark: 'HC Dark',
      } as Record<TdsThemeKey, string>,
      swatchesTitle: 'Shell Semantic Swatches & --shell-* / --tx-* Convergence',
      swatchesHint: 'Every value is resolved live from docs/design/tds/tokens.json with zero duplicated tables.',
      convergenceTitle: '--shell-* ↔ --tx-* Convergence Map',
      colRole: 'Role',
      colShell: 'CoreApp (--shell-*)',
      colTuffex: 'TuffEx (--tx-*)',
      colStatus: 'Status',
      statusLabels: {
        'aligned': 'Aligned',
        'near-aligned': 'Near-aligned',
        'aliased': 'Aliased',
        'converged-in-high-contrast': 'HC converged',
        'converged-in-hc-dark': 'HC dark converged',
        'intentional-divergence': 'Tracked divergence',
      } as Record<string, string>,
      contrastTitle: 'Refraction Surface Contrast Checker (WCAG 2.1)',
      surfaceLabel: 'Surface',
      surfaceOpaque: 'Opaque (1.00)',
      surfaceRefraction: `Refraction Glass (${TDS_REFRACTION_OPACITY.toFixed(2)})`,
      backdropLabel: 'Backdrop',
      backdropLight: `Light ${TDS_BACKDROPS.light.hex}`,
      backdropDark: `Dark ${TDS_BACKDROPS.dark.hex}`,
      sampleText: 'Body Aa',
      minContract: 'Min',
      deltaOpaque: 'vs opaque',
      summaryPassing: 'pairs meeting contract',
      summaryMinRatio: 'Lowest measured ratio',
      summaryAaaCount: 'pairs at AAA (≥7:1)',
      coreTitle: 'Core 36 Orthogonal Primitives',
      searchLabel: 'Filter primitives',
      searchPlaceholder: 'Filter by slug, component, or role (e.g. button, stream)',
      allCategory: 'All',
      categories: {
        surface: 'Surface & Layout',
        display: 'Display',
        data: 'Data',
        form: 'Form & Input',
        navigation: 'Navigation',
        overlay: 'Overlay & Feedback',
        ai: 'AI Core',
      } as Record<TdsPrimitiveCategory, string>,
      emptyPrimitives: 'No matching Core primitives. Clear the filter to browse all 36.',
      showingCount: (shown: number, total: number) => `Showing ${shown} / ${total}`,
      openDoc: 'Open component docs',
      caption: `Single-source catalog v${TDS_TOKENS.meta.version} (default surface: ${TDS_TOKENS.materials.defaultSurface}, body scale: ${TDS_TOKENS.meta.rules.bodyFontSizePx.join('–')}px, hover color transition: ${TDS_TOKENS.meta.rules.hoverColorTransitionMs}ms). Imported directly from docs/design/tds/tokens.json to inspect all four ramps, 0.85 refraction WCAG 2.1 contrast over light/dark backdrops, and all 36 Core primitives.`,
    })

const activeSelector = computed(() => getThemeSelector(activeTheme.value))
const swatches = computed(() => getThemeRampSwatches(activeTheme.value))
const contrastRows = computed(() => evaluateRefractionContrast(activeTheme.value, surfaceMode.value, backdropKey.value))

const contrastSummary = computed(() => {
  const rows = contrastRows.value
  const passing = rows.filter(row => row.meetsContract).length
  const aaaCount = rows.filter(row => row.passAAA).length
  const minRatio = rows.length ? Math.min(...rows.map(row => row.ratio)) : 0
  return {
    total: rows.length,
    passing,
    aaaCount,
    minRatio,
    allPass: passing === rows.length,
  }
})

const filteredPrimitives = computed(() => filterCorePrimitives(activeCategory.value, searchQuery.value))

const categoryCounts = computed(() => {
  const counts: Record<TdsPrimitiveCategory, number> = {
    surface: 0,
    display: 0,
    data: 0,
    form: 0,
    navigation: 0,
    overlay: 0,
    ai: 0,
  }
  for (const item of TDS_CORE_PRIMITIVES)
    counts[item.category] += 1
  return counts
})

const wallpaperHex = computed(() => TDS_BACKDROPS[backdropKey.value].hex)

function selectTheme(theme: TdsThemeKey) {
  activeTheme.value = theme
  if (theme === 'light' || theme === 'highContrastLight')
    backdropKey.value = 'light'
  else
    backdropKey.value = 'dark'
}

function resetDemo() {
  activeTheme.value = props.initialTheme
  surfaceMode.value = props.initialSurface
  backdropKey.value = props.initialBackdrop
  activeCategory.value = props.initialCategory
  searchQuery.value = props.initialQuery
}

defineExpose({ resetDemo })
</script>

<template>
  <ConceptFigure class="tds-ins" stage="plain" :caption="copy.caption">
    <div class="tds-ins__body">
      <!-- Band 1: Theme Ramp & Convergence -->
      <section class="tds-ins__section" data-tds-section="ramps">
        <header class="tds-ins__head">
          <div class="tds-ins__title-group">
            <span class="i-carbon-color-palette tds-ins__icon" aria-hidden="true" />
            <div>
              <h4 class="tds-ins__title">
                {{ copy.swatchesTitle }}
              </h4>
              <p class="tds-ins__hint">
                {{ copy.swatchesHint }}
              </p>
            </div>
          </div>
          <span class="tds-ins__meta-pill cfig-mono">
            {{ copy.sourceLabel }} · {{ activeSelector }}
          </span>
        </header>

        <div class="tds-ins__toolbar" role="group" :aria-label="copy.themeLabel">
          <button
            v-for="theme in TDS_THEME_KEYS"
            :key="theme"
            type="button"
            class="tds-ins__seg-btn"
            :class="{ 'is-active': activeTheme === theme }"
            :aria-pressed="activeTheme === theme"
            :data-tds-theme-btn="theme"
            @click="selectTheme(theme)"
          >
            {{ copy.themes[theme] }}
          </button>
        </div>

        <ul class="tds-ins__swatch-grid">
          <li
            v-for="item in swatches"
            :key="item.token"
            class="tds-ins__swatch-card"
            :data-tds-token="item.token"
          >
            <span
              class="tds-ins__swatch-chip"
              :style="{ backgroundColor: item.resolvedCss }"
              aria-hidden="true"
            />
            <div class="tds-ins__swatch-meta">
              <code class="tds-ins__token-name cfig-mono">{{ item.token }}</code>
              <span class="tds-ins__token-val cfig-mono">
                {{ item.resolvedHex }}<template v-if="item.alpha < 1"> · α{{ item.alpha }}</template>
              </span>
              <span v-if="item.isAlias" class="tds-ins__token-alias cfig-mono">{{ item.rawValue }}</span>
            </div>
          </li>
        </ul>

        <div class="tds-ins__convergence">
          <div class="tds-ins__subhead">
            <span class="i-carbon-layers tds-ins__subicon" aria-hidden="true" />
            <span>{{ copy.convergenceTitle }}</span>
          </div>
          <div class="tds-ins__table-wrap">
            <table class="tds-ins__table">
              <thead>
                <tr>
                  <th scope="col">
                    {{ copy.colRole }}
                  </th>
                  <th scope="col">
                    {{ copy.colShell }}
                  </th>
                  <th scope="col">
                    {{ copy.colTuffex }}
                  </th>
                  <th scope="col">
                    {{ copy.colStatus }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in TDS_CONVERGENCE_MAPPINGS" :key="row.role">
                  <td class="tds-ins__cell-role">
                    {{ row.role }}
                  </td>
                  <td><code class="cfig-mono">{{ row.shell }}</code></td>
                  <td>
                    <code class="cfig-mono">{{ row.tuffex }}</code>
                    <code v-if="row.bui" class="tds-ins__bui-tag cfig-mono">{{ row.bui }}</code>
                  </td>
                  <td>
                    <span
                      class="tds-ins__status-pill"
                      :class="row.status === 'intentional-divergence' ? 'is-warn' : 'is-aligned'"
                    >
                      {{ copy.statusLabels[row.status] ?? row.status }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- Band 2: Interactive Refraction Surface Contrast Checker -->
      <section class="tds-ins__section" data-tds-section="contrast">
        <header class="tds-ins__head">
          <div class="tds-ins__title-group">
            <span class="i-carbon-contrast tds-ins__icon" aria-hidden="true" />
            <h4 class="tds-ins__title">
              {{ copy.contrastTitle }}
            </h4>
          </div>
        </header>

        <div class="tds-ins__contrast-controls">
          <div class="tds-ins__control-group" role="group" :aria-label="copy.surfaceLabel">
            <span class="tds-ins__control-label">{{ copy.surfaceLabel }}</span>
            <div class="tds-ins__seg-row">
              <button
                type="button"
                class="tds-ins__seg-btn"
                :class="{ 'is-active': surfaceMode === 'opaque' }"
                :aria-pressed="surfaceMode === 'opaque'"
                data-tds-surface-btn="opaque"
                @click="surfaceMode = 'opaque'"
              >
                {{ copy.surfaceOpaque }}
              </button>
              <button
                type="button"
                class="tds-ins__seg-btn"
                :class="{ 'is-active': surfaceMode === 'refraction' }"
                :aria-pressed="surfaceMode === 'refraction'"
                data-tds-surface-btn="refraction"
                @click="surfaceMode = 'refraction'"
              >
                {{ copy.surfaceRefraction }}
              </button>
            </div>
          </div>

          <div class="tds-ins__control-group" role="group" :aria-label="copy.backdropLabel">
            <span class="tds-ins__control-label">{{ copy.backdropLabel }}</span>
            <div class="tds-ins__seg-row">
              <button
                type="button"
                class="tds-ins__seg-btn"
                :class="{ 'is-active': backdropKey === 'light' }"
                :aria-pressed="backdropKey === 'light'"
                data-tds-backdrop-btn="light"
                @click="backdropKey = 'light'"
              >
                <span class="tds-ins__dot" :style="{ backgroundColor: TDS_BACKDROPS.light.hex }" aria-hidden="true" />
                {{ copy.backdropLight }}
              </button>
              <button
                type="button"
                class="tds-ins__seg-btn"
                :class="{ 'is-active': backdropKey === 'dark' }"
                :aria-pressed="backdropKey === 'dark'"
                data-tds-backdrop-btn="dark"
                @click="backdropKey = 'dark'"
              >
                <span class="tds-ins__dot" :style="{ backgroundColor: TDS_BACKDROPS.dark.hex }" aria-hidden="true" />
                {{ copy.backdropDark }}
              </button>
            </div>
          </div>
        </div>

        <div class="tds-ins__contrast-stage" :style="{ backgroundColor: wallpaperHex }">
          <div class="tds-ins__contrast-grid">
            <article
              v-for="row in contrastRows"
              :key="row.id"
              class="tds-ins__contrast-card"
              :data-tds-contrast-id="row.id"
              :data-tds-wcag-grade="row.grade"
            >
              <div
                class="tds-ins__contrast-sample"
                :style="{ backgroundColor: row.bgCss, color: row.fgCss }"
              >
                <span class="tds-ins__sample-text">{{ copy.sampleText }}</span>
                <span class="tds-ins__sample-ratio cfig-mono">{{ row.ratio.toFixed(2) }}:1</span>
              </div>
              <div class="tds-ins__contrast-foot">
                <div class="tds-ins__contrast-tokens cfig-mono">
                  <span>{{ row.fgToken.replace('--shell-', '') }}</span>
                  <span class="tds-ins__sep">/</span>
                  <span>{{ row.bgToken.replace('--shell-', '') }}</span>
                </div>
                <div class="tds-ins__badges">
                  <span
                    class="tds-ins__wcag-badge cfig-mono"
                    :class="row.passAAA ? 'is-aaa' : row.passAA ? 'is-aa' : row.passLarge ? 'is-large' : 'is-fail'"
                  >
                    <span
                      :class="row.meetsContract ? 'i-carbon-checkmark-filled' : row.passLarge ? 'i-carbon-warning-filled' : 'i-carbon-close-filled'"
                      aria-hidden="true"
                    />
                    {{ row.grade }}
                  </span>
                  <span class="tds-ins__min-tag cfig-mono">
                    {{ copy.minContract }} {{ row.minRatio.toFixed(1) }}
                  </span>
                  <span v-if="surfaceMode === 'refraction' && row.delta !== 0" class="tds-ins__delta cfig-mono">
                    {{ row.delta > 0 ? `+${row.delta.toFixed(2)}` : row.delta.toFixed(2) }}
                  </span>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <!-- Band 3: Filterable Core 36 Primitives Matrix -->
      <section class="tds-ins__section" data-tds-section="core-36">
        <header class="tds-ins__head">
          <div class="tds-ins__title-group">
            <span class="i-carbon-cube tds-ins__icon" aria-hidden="true" />
            <h4 class="tds-ins__title">
              {{ copy.coreTitle }}
            </h4>
          </div>
          <span class="tds-ins__meta-pill cfig-mono" data-tds-core-count>
            {{ copy.showingCount(filteredPrimitives.length, TDS_CORE_PRIMITIVES.length) }}
          </span>
        </header>

        <div class="tds-ins__core-controls">
          <div class="tds-ins__search-row">
            <label for="tds-core-search" class="tds-ins__control-label">{{ copy.searchLabel }}</label>
            <div class="tds-ins__search-box">
              <span class="i-carbon-search tds-ins__search-icon" aria-hidden="true" />
              <input
                id="tds-core-search"
                v-model="searchQuery"
                type="search"
                class="tds-ins__search-input"
                :placeholder="copy.searchPlaceholder"
              >
            </div>
          </div>

          <div class="tds-ins__cat-row" role="group" :aria-label="copy.coreTitle">
            <button
              type="button"
              class="tds-ins__seg-btn"
              :class="{ 'is-active': activeCategory === 'all' }"
              :aria-pressed="activeCategory === 'all'"
              @click="activeCategory = 'all'"
            >
              {{ copy.allCategory }} ({{ TDS_CORE_PRIMITIVES.length }})
            </button>
            <button
              v-for="cat in TDS_PRIMITIVE_CATEGORIES"
              :key="cat"
              type="button"
              class="tds-ins__seg-btn"
              :class="{ 'is-active': activeCategory === cat }"
              :aria-pressed="activeCategory === cat"
              @click="activeCategory = cat"
            >
              {{ copy.categories[cat] }} ({{ categoryCounts[cat] }})
            </button>
          </div>
        </div>

        <p v-if="filteredPrimitives.length === 0" class="tds-ins__empty">
          {{ copy.emptyPrimitives }}
        </p>

        <div v-else class="tds-ins__core-grid">
          <a
            v-for="item in filteredPrimitives"
            :key="item.slug"
            :href="item.docPath"
            class="tds-ins__core-card"
            :data-tds-primitive="item.slug"
            :title="`${copy.openDoc}: ${item.component}`"
          >
            <div class="tds-ins__core-top">
              <span class="tds-ins__core-comp">{{ item.component }}</span>
              <span class="tds-ins__suite-tag cfig-mono">{{ item.suite }}</span>
            </div>
            <div class="tds-ins__core-slug-row">
              <code class="tds-ins__core-slug cfig-mono">{{ item.slug }}</code>
              <span class="i-carbon-arrow-up-right tds-ins__core-arrow" aria-hidden="true" />
            </div>
            <p class="tds-ins__core-role">
              {{ isZh ? item.role.zh : item.role.en }}
            </p>
          </a>
        </div>
      </section>
    </div>

    <template #readout>
      <span class="cfig-stat" :class="contrastSummary.allPass ? 'is-pass' : 'is-fail'">
        <span class="cfig-stat__label">{{ copy.summaryPassing }}</span>
        <span class="cfig-stat__value">{{ contrastSummary.passing }}/{{ contrastSummary.total }}</span>
      </span>
      <span class="cfig-stat is-accent">
        <span class="cfig-stat__label">{{ copy.summaryMinRatio }}</span>
        <span class="cfig-stat__value">{{ contrastSummary.minRatio.toFixed(2) }}:1</span>
      </span>
      <span class="cfig-stat">
        <span class="cfig-stat__label">{{ copy.summaryAaaCount }}</span>
        <span class="cfig-stat__value">{{ contrastSummary.aaaCount }}/{{ contrastSummary.total }}</span>
      </span>
    </template>
  </ConceptFigure>
</template>

<style scoped>
.tds-ins__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 14px;
}

.tds-ins__section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--tx-border-color-lighter, #ebeef5);
  border-radius: 12px;
  background: var(--tx-bg-color, #ffffff);
  color: var(--tx-text-color-primary, #303133);
}

.tds-ins__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px 12px;
}

.tds-ins__title-group {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.tds-ins__icon {
  flex: none;
  margin-top: 2px;
  font-size: 15px;
  color: var(--tx-color-primary, #409eff);
}

.tds-ins__title {
  margin: 0;
  font-size: 14px;
  font-weight: var(--tx-font-weight-semibold, 600);
  line-height: 1.35;
  text-wrap: balance;
}

.tds-ins__hint {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.tds-ins__meta-pill {
  flex: none;
  padding: 2px 8px;
  border: 1px solid var(--tx-border-color-lighter, #ebeef5);
  border-radius: 999px;
  background: var(--tx-fill-color-lighter, #fafafa);
  color: var(--tx-text-color-regular, #606266);
  font-size: 11px;
  line-height: 18px;
}

.tds-ins__toolbar,
.tds-ins__seg-row,
.tds-ins__cat-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tds-ins__seg-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 4px 10px;
  border: 1px solid var(--tx-border-color, #dcdfe6);
  border-radius: 8px;
  background: var(--tx-bg-color, #ffffff);
  color: var(--tx-text-color-regular, #606266);
  font: inherit;
  font-size: 12px;
  font-weight: var(--tx-font-weight-medium, 500);
  cursor: pointer;
}

.tds-ins__seg-btn:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-primary, #303133);
}

.tds-ins__seg-btn.is-active {
  border-color: var(--tx-color-primary, #409eff);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, var(--tx-bg-color, #ffffff));
  color: var(--tx-text-color-primary, #303133);
  font-weight: var(--tx-font-weight-semibold, 600);
}

.tds-ins__seg-btn:focus-visible,
.tds-ins__search-input:focus-visible,
.tds-ins__core-card:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 2px;
}

.tds-ins__swatch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 190px), 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tds-ins__swatch-card {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--tx-border-color-lighter, #ebeef5);
  border-radius: 8px;
  background: var(--tx-fill-color-lighter, #fafafa);
}

.tds-ins__swatch-chip {
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid var(--tx-border-color, #dcdfe6);
}

.tds-ins__swatch-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tds-ins__token-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--tx-text-color-primary, #303133);
}

.tds-ins__token-val {
  font-size: 11px;
  color: var(--tx-text-color-regular, #606266);
}

.tds-ins__token-alias {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: var(--tx-text-color-secondary, #909399);
}

.tds-ins__convergence {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--tx-border-color-lighter, #ebeef5);
}

.tds-ins__subhead {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: var(--tx-font-weight-semibold, 600);
  color: var(--tx-text-color-regular, #606266);
}

.tds-ins__subicon {
  font-size: 13px;
  color: var(--tx-color-primary, #409eff);
}

.tds-ins__table-wrap {
  overflow-x: auto;
}

.tds-ins__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.tds-ins__table th,
.tds-ins__table td {
  padding: 6px 8px;
  text-align: left;
  border-top: 1px solid var(--tx-border-color-lighter, #ebeef5);
  vertical-align: middle;
}

.tds-ins__table thead th {
  border-top: 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 11px;
  font-weight: var(--tx-font-weight-medium, 500);
}

.tds-ins__cell-role {
  font-weight: var(--tx-font-weight-medium, 500);
  white-space: nowrap;
}

.tds-ins__bui-tag {
  margin-left: 6px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--tx-fill-color-light, #f5f7fa);
  font-size: 11px;
  color: var(--tx-text-color-regular, #606266);
}

.tds-ins__status-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: var(--tx-font-weight-medium, 500);
  white-space: nowrap;
}

.tds-ins__status-pill.is-aligned {
  background: color-mix(in srgb, var(--tx-color-success, #67c23a) 14%, transparent);
  color: color-mix(in srgb, var(--tx-color-success, #67c23a) 45%, var(--tx-text-color-primary, #303133));
}

.tds-ins__status-pill.is-warn {
  background: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 14%, transparent);
  color: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 45%, var(--tx-text-color-primary, #303133));
}

.tds-ins__contrast-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
}

.tds-ins__control-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}

.tds-ins__control-label {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
  white-space: nowrap;
}

.tds-ins__dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  border: 1px solid var(--tx-border-color, #dcdfe6);
}

.tds-ins__contrast-stage {
  padding: 12px;
  border: 1px solid var(--tx-border-color-lighter, #ebeef5);
  border-radius: 10px;
}

.tds-ins__contrast-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 210px), 1fr));
  gap: 8px;
}

.tds-ins__contrast-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--tx-border-color-lighter, #ebeef5);
  border-radius: 8px;
  background: var(--tx-bg-color, #ffffff);
}

.tds-ins__contrast-sample {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
}

.tds-ins__sample-text {
  font-size: 13px;
  font-weight: var(--tx-font-weight-semibold, 600);
}

.tds-ins__sample-ratio {
  font-size: 12px;
  font-weight: var(--tx-font-weight-semibold, 600);
}

.tds-ins__contrast-foot {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 7px 10px;
  border-top: 1px solid var(--tx-border-color-lighter, #ebeef5);
  background: var(--tx-bg-color, #ffffff);
}

.tds-ins__contrast-tokens {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--tx-text-color-regular, #606266);
}

.tds-ins__sep {
  margin: 0 3px;
  color: var(--tx-text-color-secondary, #909399);
}

.tds-ins__badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.tds-ins__wcag-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: var(--tx-font-weight-semibold, 600);
}

.tds-ins__wcag-badge.is-aaa,
.tds-ins__wcag-badge.is-aa {
  background: color-mix(in srgb, var(--tx-color-success, #67c23a) 14%, transparent);
  color: color-mix(in srgb, var(--tx-color-success, #67c23a) 45%, var(--tx-text-color-primary, #303133));
}

.tds-ins__wcag-badge.is-large {
  background: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 14%, transparent);
  color: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 45%, var(--tx-text-color-primary, #303133));
}

.tds-ins__wcag-badge.is-fail {
  background: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 14%, transparent);
  color: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 55%, var(--tx-text-color-primary, #303133));
}

.tds-ins__min-tag,
.tds-ins__delta {
  font-size: 11px;
  color: var(--tx-text-color-secondary, #909399);
}

.tds-ins__core-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tds-ins__search-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.tds-ins__search-box {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 260px;
  min-width: 0;
}

.tds-ins__search-icon {
  position: absolute;
  left: 10px;
  font-size: 14px;
  color: var(--tx-text-color-secondary, #909399);
  pointer-events: none;
}

.tds-ins__search-input {
  width: 100%;
  height: 32px;
  padding: 0 10px 0 30px;
  border: 1px solid var(--tx-border-color, #dcdfe6);
  border-radius: 8px;
  background: var(--tx-bg-color, #ffffff);
  color: var(--tx-text-color-primary, #303133);
  font: inherit;
  font-size: 13px;
}

.tds-ins__core-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 195px), 1fr));
  gap: 8px;
}

.tds-ins__core-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 11px;
  border: 1px solid var(--tx-border-color-lighter, #ebeef5);
  border-radius: 8px;
  background: var(--tx-fill-color-lighter, #fafafa);
  color: inherit;
  text-decoration: none;
}

.tds-ins__core-card:hover {
  border-color: var(--tx-color-primary, #409eff);
  background: var(--tx-fill-color-light, #f5f7fa);
}

.tds-ins__core-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.tds-ins__core-comp {
  font-size: 13px;
  font-weight: var(--tx-font-weight-semibold, 600);
  color: var(--tx-text-color-primary, #303133);
}

.tds-ins__suite-tag {
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 10%, transparent);
  color: var(--tx-text-color-regular, #606266);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tds-ins__core-slug-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.tds-ins__core-slug {
  font-size: 11px;
  color: var(--tx-color-primary, #409eff);
}

.tds-ins__core-arrow {
  flex: none;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.tds-ins__core-role {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--tx-text-color-regular, #606266);
  text-wrap: pretty;
}

.tds-ins__empty {
  margin: 4px 0;
  font-size: 13px;
  color: var(--tx-text-color-secondary, #909399);
}

@media (prefers-reduced-motion: reduce) {
  .tds-ins__body *,
  .tds-ins__body *::before,
  .tds-ins__body *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
