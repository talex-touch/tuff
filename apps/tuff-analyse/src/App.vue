<script setup lang="ts">
import type { AnalysisArea, AnalysisItem, AnalysisStatus, RiskLevel, SecurityAlert } from './data/tuff-cleanup-analysis'
import { computed, ref } from 'vue'
import {

  analysisItems,

  baseline,
  frequencyLabels,
  needLabels,
  riskLabels,

  securityAlerts,
  statusLabels,
  trends,
  upgradeGroups,
} from './data/tuff-cleanup-analysis'

const statusFilters = ref<AnalysisStatus[]>([])
const areaFilter = ref<'all' | AnalysisArea>('all')
const riskFilter = ref<'all' | RiskLevel>('all')
const searchQuery = ref('')
const selectedItem = ref<AnalysisItem>(analysisItems[0])
const activePanel = ref<'items' | 'security' | 'upgrades' | 'trends'>('items')

const allAreas = computed(() => {
  return Array.from(new Set(analysisItems.map(item => item.area))).sort()
})

const riskOrder: RiskLevel[] = ['critical', 'high', 'medium', 'low']
const statusOrder: AnalysisStatus[] = [
  'keep',
  'cleanup',
  'replace',
  'upgrade',
  'defer',
  'removeCandidate',
  'dangerConfirm',
  'monitor',
]

const statusCounts = computed(() => {
  const counts = new Map<AnalysisStatus, number>()
  for (const status of statusOrder)
    counts.set(status, 0)
  for (const item of analysisItems)
    counts.set(item.status, (counts.get(item.status) ?? 0) + 1)
  return counts
})

const securityCounts = computed(() => {
  const counts = new Map<RiskLevel, number>()
  for (const risk of riskOrder)
    counts.set(risk, 0)
  for (const alert of securityAlerts)
    counts.set(alert.severity, (counts.get(alert.severity) ?? 0) + 1)
  return counts
})

const filteredItems = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return analysisItems.filter((item) => {
    const statusMatched = statusFilters.value.length === 0 || statusFilters.value.includes(item.status)
    const areaMatched = areaFilter.value === 'all' || item.area === areaFilter.value
    const riskMatched = riskFilter.value === 'all' || item.risk === riskFilter.value
    const queryMatched = !query || [
      item.area,
      item.item,
      item.currentUsage,
      item.recommendation,
      item.migrationTarget,
      item.trend,
      ...item.evidence,
      ...item.actions,
      ...item.risks,
    ].join(' ').toLowerCase().includes(query)

    return statusMatched && areaMatched && riskMatched && queryMatched
  })
})

const filteredSecurityAlerts = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return securityAlerts.filter((alert) => {
    const riskMatched = riskFilter.value === 'all' || alert.severity === riskFilter.value
    const queryMatched = !query || [
      alert.packageName,
      alert.advisory,
      alert.cve ?? '',
      alert.path,
      alert.impact,
      alert.recommendation,
    ].join(' ').toLowerCase().includes(query)
    return riskMatched && queryMatched
  })
})

const selectedSecurityAlert = ref<SecurityAlert | null>(securityAlerts[0] ?? null)

const exportJson = computed(() => {
  return JSON.stringify({
    baseline,
    analysisItems,
    upgradeGroups,
    securityAlerts,
    trends,
  }, null, 2)
})

const markdownExport = computed(() => {
  const rows = analysisItems.map(item => `| ${item.area} | ${item.item} | ${statusLabels[item.status]} | ${riskLabels[item.risk]} | ${item.recommendation.replaceAll('|', '/')} |`)
  return [
    '# Tuff Analyse',
    '',
    `- Baseline: ${baseline.version}`,
    `- Generated: ${baseline.generatedAt}`,
    `- Repo size: ${baseline.repoSize}`,
    '',
    '| Area | Item | Status | Risk | Recommendation |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
})

function toggleStatus(status: AnalysisStatus) {
  if (statusFilters.value.includes(status)) {
    statusFilters.value = statusFilters.value.filter(item => item !== status)
    return
  }
  statusFilters.value = [...statusFilters.value, status]
}

function resetFilters() {
  statusFilters.value = []
  areaFilter.value = 'all'
  riskFilter.value = 'all'
  searchQuery.value = ''
}

function downloadText(name: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

function selectItem(item: AnalysisItem) {
  selectedItem.value = item
  activePanel.value = 'items'
}

function selectSecurityAlert(alert: SecurityAlert) {
  selectedSecurityAlert.value = alert
  activePanel.value = 'security'
}
</script>

<template>
  <main class="analyse-shell">
    <section class="topbar">
      <div>
        <p class="eyebrow">
          Tuff Analyse / Static Expert Report
        </p>
        <h1>版本升级、清理与安全治理分析台</h1>
        <p class="topbar__summary">
          基线 {{ baseline.version }}，Node {{ baseline.node }}，pnpm {{ baseline.pnpm }}。本页是可复用清单，不执行删除、升级、提交或发布动作。
        </p>
      </div>
      <div class="topbar__meta">
        <span>{{ baseline.repoSize }}</span>
        <span>{{ baseline.generatedAt }}</span>
        <span>Vue / TuffEx</span>
      </div>
    </section>

    <section class="risk-strip" aria-label="主要风险">
      <article v-for="risk in baseline.majorRisks" :key="risk">
        {{ risk }}
      </article>
    </section>

    <section class="metrics-grid" aria-label="总览指标">
      <article class="metric">
        <span class="metric__label">清单项目</span>
        <strong>{{ analysisItems.length }}</strong>
        <span class="metric__hint">覆盖 CoreApp / Nexus / TuffEx / Packages / Plugins / Security</span>
      </article>
      <article class="metric">
        <span class="metric__label">安全告警</span>
        <strong>{{ securityAlerts.length }}</strong>
        <span class="metric__hint">pnpm audit + GitHub Dependabot 重点项</span>
      </article>
      <article class="metric metric--danger">
        <span class="metric__label">Critical</span>
        <strong>{{ securityCounts.get('critical') }}</strong>
        <span class="metric__hint">shell-quote / vitest / audit summary</span>
      </article>
      <article class="metric">
        <span class="metric__label">需要确认</span>
        <strong>{{ analysisItems.filter(item => item.requiresConfirmation).length }}</strong>
        <span class="metric__hint">删除、批量清理、运行时数据处理</span>
      </article>
    </section>

    <section class="workspace">
      <aside class="filters" aria-label="筛选条件">
        <div class="filter-block">
          <label for="search">搜索</label>
          <input
            id="search"
            v-model="searchQuery"
            type="search"
            placeholder="搜索模块、依赖、风险、迁移..."
          >
        </div>

        <div class="filter-block">
          <label for="area">领域</label>
          <select id="area" v-model="areaFilter">
            <option value="all">
              全部领域
            </option>
            <option v-for="area in allAreas" :key="area" :value="area">
              {{ area }}
            </option>
          </select>
        </div>

        <div class="filter-block">
          <label for="risk">风险</label>
          <select id="risk" v-model="riskFilter">
            <option value="all">
              全部风险
            </option>
            <option v-for="risk in riskOrder" :key="risk" :value="risk">
              {{ riskLabels[risk] }}
            </option>
          </select>
        </div>

        <div class="filter-block">
          <div class="filter-heading">
            <span>状态</span>
            <button type="button" @click="resetFilters">
              重置
            </button>
          </div>
          <button
            v-for="status in statusOrder"
            :key="status"
            type="button"
            class="status-filter"
            :class="{ 'is-active': statusFilters.includes(status) }"
            @click="toggleStatus(status)"
          >
            <span>{{ statusLabels[status] }}</span>
            <strong>{{ statusCounts.get(status) }}</strong>
          </button>
        </div>

        <div class="filter-block">
          <div class="filter-heading">
            <span>导出</span>
          </div>
          <button type="button" class="export-button" @click="downloadText('tuff-analyse.json', exportJson, 'application/json')">
            JSON
          </button>
          <button type="button" class="export-button" @click="downloadText('tuff-analyse.md', markdownExport, 'text/markdown')">
            Markdown
          </button>
        </div>
      </aside>

      <section class="content">
        <div class="panel-tabs" role="tablist" aria-label="报告视图">
          <button type="button" :class="{ 'is-active': activePanel === 'items' }" @click="activePanel = 'items'">
            清理总表
          </button>
          <button type="button" :class="{ 'is-active': activePanel === 'security' }" @click="activePanel = 'security'">
            GitHub Vulnerability
          </button>
          <button type="button" :class="{ 'is-active': activePanel === 'upgrades' }" @click="activePanel = 'upgrades'">
            升级路线
          </button>
          <button type="button" :class="{ 'is-active': activePanel === 'trends' }" @click="activePanel = 'trends'">
            趋势判断
          </button>
        </div>

        <section v-if="activePanel === 'items'" class="data-layout">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Area</th>
                  <th>Item</th>
                  <th>Need</th>
                  <th>Cleanup</th>
                  <th>Outdated</th>
                  <th>Risk</th>
                  <th>Migration</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in filteredItems"
                  :key="item.id"
                  :class="{ 'is-selected': selectedItem.id === item.id }"
                  tabindex="0"
                  @click="selectItem(item)"
                  @keydown.enter="selectItem(item)"
                >
                  <td><span class="pill" :data-status="item.status">{{ statusLabels[item.status] }}</span></td>
                  <td>{{ item.area }}</td>
                  <td>
                    <strong>{{ item.item }}</strong>
                    <small>{{ item.currentUsage }}</small>
                  </td>
                  <td>{{ needLabels[item.need] }}</td>
                  <td>{{ item.canCleanup ? '是' : '否' }}</td>
                  <td>{{ item.outdated ? '是' : '否' }}</td>
                  <td><span class="risk" :data-risk="item.risk">{{ riskLabels[item.risk] }}</span></td>
                  <td>{{ item.migrationTarget }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <aside class="detail-panel">
            <p class="eyebrow">
              {{ selectedItem.area }} / {{ statusLabels[selectedItem.status] }}
            </p>
            <h2>{{ selectedItem.item }}</h2>
            <p>{{ selectedItem.recommendation }}</p>

            <dl class="detail-grid">
              <div>
                <dt>用户价值</dt>
                <dd>{{ selectedItem.userValue }}</dd>
              </div>
              <div>
                <dt>频率推断</dt>
                <dd>{{ frequencyLabels[selectedItem.frequency] }}</dd>
              </div>
              <div>
                <dt>收益</dt>
                <dd>{{ selectedItem.benefit }}</dd>
              </div>
              <div>
                <dt>推荐时机</dt>
                <dd>{{ selectedItem.timing }}</dd>
              </div>
            </dl>

            <div class="detail-section">
              <h3>证据</h3>
              <ul>
                <li v-for="evidence in selectedItem.evidence" :key="evidence">
                  {{ evidence }}
                </li>
              </ul>
            </div>

            <div class="detail-section">
              <h3>动作</h3>
              <ul>
                <li v-for="action in selectedItem.actions" :key="action">
                  {{ action }}
                </li>
              </ul>
            </div>

            <div class="detail-section">
              <h3>风险</h3>
              <ul>
                <li v-for="risk in selectedItem.risks" :key="risk">
                  {{ risk }}
                </li>
              </ul>
            </div>

            <div class="detail-section">
              <h3>验证命令</h3>
              <code v-for="command in selectedItem.validation" :key="command">{{ command }}</code>
            </div>

            <div class="detail-section">
              <h3>同类产品趋势</h3>
              <p>{{ selectedItem.trend }}</p>
            </div>
          </aside>
        </section>

        <section v-else-if="activePanel === 'security'" class="security-layout">
          <div class="risk-matrix">
            <article v-for="risk in riskOrder" :key="risk">
              <span>{{ riskLabels[risk] }}</span>
              <strong>{{ securityCounts.get(risk) }}</strong>
            </article>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Package</th>
                  <th>Scope</th>
                  <th>State</th>
                  <th>Advisory</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="alert in filteredSecurityAlerts"
                  :key="alert.id"
                  :class="{ 'is-selected': selectedSecurityAlert?.id === alert.id }"
                  tabindex="0"
                  @click="selectSecurityAlert(alert)"
                  @keydown.enter="selectSecurityAlert(alert)"
                >
                  <td><span class="risk" :data-risk="alert.severity">{{ riskLabels[alert.severity] }}</span></td>
                  <td>{{ alert.packageName }}</td>
                  <td>{{ alert.scope }}</td>
                  <td>{{ alert.state }}</td>
                  <td>{{ alert.advisory }}</td>
                  <td>{{ alert.priority }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <aside v-if="selectedSecurityAlert" class="detail-panel detail-panel--wide">
            <p class="eyebrow">
              {{ selectedSecurityAlert.source }} / {{ selectedSecurityAlert.scope }}
            </p>
            <h2>{{ selectedSecurityAlert.packageName }}</h2>
            <p>{{ selectedSecurityAlert.impact }}</p>
            <dl class="detail-grid">
              <div>
                <dt>Advisory</dt>
                <dd>{{ selectedSecurityAlert.advisory }}</dd>
              </div>
              <div>
                <dt>CVE</dt>
                <dd>{{ selectedSecurityAlert.cve ?? '无' }}</dd>
              </div>
              <div>
                <dt>Manifest</dt>
                <dd>{{ selectedSecurityAlert.path }}</dd>
              </div>
              <div>
                <dt>修复优先级</dt>
                <dd>{{ selectedSecurityAlert.priority }}</dd>
              </div>
            </dl>
            <div class="detail-section">
              <h3>建议</h3>
              <p>{{ selectedSecurityAlert.recommendation }}</p>
            </div>
            <a v-if="selectedSecurityAlert.url" :href="selectedSecurityAlert.url" target="_blank" rel="noreferrer">
              打开 GitHub alert
            </a>
          </aside>
        </section>

        <section v-else-if="activePanel === 'upgrades'" class="cards-grid">
          <article v-for="group in upgradeGroups" :key="group.id" class="route-card">
            <span class="route-card__phase">{{ group.phase }} / {{ group.priority }}</span>
            <h2>{{ group.title }}</h2>
            <p>{{ group.strategy }}</p>
            <div class="package-list">
              <span v-for="pkg in group.packages" :key="pkg">{{ pkg }}</span>
            </div>
            <dl>
              <dt>目标</dt>
              <dd>{{ group.target }}</dd>
              <dt>验证</dt>
              <dd>{{ group.validation.join(' / ') }}</dd>
            </dl>
          </article>
        </section>

        <section v-else class="cards-grid">
          <article v-for="trend in trends" :key="trend.id" class="route-card">
            <span class="route-card__phase">{{ trend.products.join(' / ') }}</span>
            <h2>{{ trend.title }}</h2>
            <p>{{ trend.observation }}</p>
            <strong>{{ trend.tuffImplication }}</strong>
          </article>
        </section>
      </section>
    </section>
  </main>
</template>
