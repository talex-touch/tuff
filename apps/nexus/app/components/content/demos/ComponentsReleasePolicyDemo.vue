<script setup lang="ts">
import type { CascaderNode } from '@talex-touch/tuffex/cascader'
import type { TxFlatSelectValue } from '@talex-touch/tuffex/flat-select'
import type { SegmentedSliderSegment } from '@talex-touch/tuffex/segmented-slider'
import { computed, ref } from 'vue'

const { locale } = useI18n()

const releasePath = ref(['desktop', 'stable', 'macos'])
const format = ref<TxFlatSelectValue>('signed')
const rollout = ref<TxFlatSelectValue>('phased')
const traffic = ref(35)
const riskLevel = ref(2)
const labelsInput = ref(['nexus', 'verified'])

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      eyebrow: 'Tuffex · Release Policy',
      title: '发布策略配置',
      subtitle: '把级联范围、平铺选择、分段策略、比例滑块和标签输入收敛成一个后台配置流。',
      scope: '发布范围',
      package: '包格式',
      rollout: '发布模式',
      traffic: '灰度流量',
      risk: '风险档位',
      labels: '发布标签',
      tagsPlaceholder: '输入标签后回车',
      signed: '签名构建',
      archive: '归档包',
      delta: '差分包',
      immediate: '立即发布',
      phased: '分阶段',
      guarded: '护栏发布',
      draft: '策略草稿',
      reviewed: '配置已审阅',
      preview: '发布预览',
      current: '当前策略',
      selectedScope: 'Desktop / Stable / macOS',
      trafficText: '灰度 {value}%',
      riskText: '风险 {value}',
      summary: '先限定发布范围，再决定包格式与发布模式；滑块只负责数值阈值，标签只承载检索元数据。',
      riskSegments: [
        { value: 1, label: '低' },
        { value: 2, label: '中' },
        { value: 3, label: '高' },
        { value: 4, label: '冻结' },
      ] satisfies SegmentedSliderSegment[],
      scopeOptions: [
        {
          value: 'desktop',
          label: '桌面端',
          children: [
            {
              value: 'stable',
              label: '稳定通道',
              children: [
                { value: 'macos', label: 'macOS', leaf: true },
                { value: 'windows', label: 'Windows', leaf: true },
              ],
            },
            {
              value: 'beta',
              label: 'Beta 通道',
              children: [
                { value: 'linux', label: 'Linux', leaf: true },
                { value: 'preview', label: 'Preview', leaf: true },
              ],
            },
          ],
        },
        {
          value: 'nexus',
          label: 'Nexus 站点',
          children: [
            {
              value: 'docs',
              label: '文档',
              children: [
                { value: 'components', label: '组件页', leaf: true },
                { value: 'tutorials', label: '教程页', leaf: true },
              ],
            },
          ],
        },
      ] satisfies CascaderNode[],
    }
  }

  return {
    eyebrow: 'Tuffex · Release Policy',
    title: 'Release policy configuration',
    subtitle: 'Compose cascaded scope, flat selects, segmented policy, traffic slider, and tags into one admin configuration flow.',
    scope: 'Release scope',
    package: 'Package format',
    rollout: 'Rollout mode',
    traffic: 'Traffic ramp',
    risk: 'Risk tier',
    labels: 'Release labels',
    tagsPlaceholder: 'Press Enter to add tags',
    signed: 'Signed build',
    archive: 'Archive',
    delta: 'Delta patch',
    immediate: 'Immediate',
    phased: 'Phased',
    guarded: 'Guarded',
    draft: 'Policy draft',
    reviewed: 'Config reviewed',
    preview: 'Release preview',
    current: 'Current policy',
    selectedScope: 'Desktop / Stable / macOS',
    trafficText: '{value}% traffic',
    riskText: 'Risk {value}',
    summary: 'Choose the release scope first, then package format and rollout mode; sliders own numeric thresholds while tags own search metadata.',
    riskSegments: [
      { value: 1, label: 'Low' },
      { value: 2, label: 'Med' },
      { value: 3, label: 'High' },
      { value: 4, label: 'Freeze' },
    ] satisfies SegmentedSliderSegment[],
    scopeOptions: [
      {
        value: 'desktop',
        label: 'Desktop',
        children: [
          {
            value: 'stable',
            label: 'Stable',
            children: [
              { value: 'macos', label: 'macOS', leaf: true },
              { value: 'windows', label: 'Windows', leaf: true },
            ],
          },
          {
            value: 'beta',
            label: 'Beta',
            children: [
              { value: 'linux', label: 'Linux', leaf: true },
              { value: 'preview', label: 'Preview', leaf: true },
            ],
          },
        ],
      },
      {
        value: 'nexus',
        label: 'Nexus',
        children: [
          {
            value: 'docs',
            label: 'Docs',
            children: [
              { value: 'components', label: 'Components', leaf: true },
              { value: 'tutorials', label: 'Tutorials', leaf: true },
            ],
          },
        ],
      },
    ] satisfies CascaderNode[],
  }
})

const trafficText = computed(() => labels.value.trafficText.replace('{value}', String(traffic.value)))
const riskText = computed(() => labels.value.riskText.replace('{value}', String(riskLevel.value)))
const formatText = computed(() => {
  if (format.value === 'archive')
    return labels.value.archive
  if (format.value === 'delta')
    return labels.value.delta
  return labels.value.signed
})
const rolloutText = computed(() => {
  if (rollout.value === 'immediate')
    return labels.value.immediate
  if (rollout.value === 'guarded')
    return labels.value.guarded
  return labels.value.phased
})
</script>

<template>
  <section class="release-policy-demo">
    <header class="release-policy-demo__header">
      <div>
        <p class="release-policy-demo__eyebrow">
          {{ labels.eyebrow }}
        </p>
        <h3>{{ labels.title }}</h3>
        <span>{{ labels.subtitle }}</span>
      </div>
      <TxStatusBadge :text="labels.draft" status="warning" size="sm" />
    </header>

    <div class="release-policy-demo__grid">
      <section class="release-policy-demo__panel release-policy-demo__panel--main">
        <label class="release-policy-demo__field release-policy-demo__field--wide">
          <span>{{ labels.scope }}</span>
          <TxCascader
            v-model="releasePath"
            :options="labels.scopeOptions"
            :placeholder="labels.scope"
            :dropdown-width="420"
            :dropdown-max-height="280"
          />
        </label>

        <div class="release-policy-demo__split">
          <label class="release-policy-demo__field">
            <span>{{ labels.package }}</span>
            <TxFlatSelect v-model="format" :placeholder="labels.package">
              <TxFlatSelectItem value="signed" :label="labels.signed" />
              <TxFlatSelectItem value="archive" :label="labels.archive" />
              <TxFlatSelectItem value="delta" :label="labels.delta" />
            </TxFlatSelect>
          </label>

          <label class="release-policy-demo__field">
            <span>{{ labels.rollout }}</span>
            <TxFlatSelect v-model="rollout" :placeholder="labels.rollout">
              <TxFlatSelectItem value="immediate" :label="labels.immediate" />
              <TxFlatSelectItem value="phased" :label="labels.phased" />
              <TxFlatSelectItem value="guarded" :label="labels.guarded" />
            </TxFlatSelect>
          </label>
        </div>

        <label class="release-policy-demo__field release-policy-demo__field--wide">
          <span>{{ labels.risk }}</span>
          <TxSegmentedSlider v-model="riskLevel" :segments="labels.riskSegments" />
        </label>

        <label class="release-policy-demo__field release-policy-demo__field--wide">
          <span>{{ labels.traffic }}</span>
          <TxSlider
            v-model="traffic"
            :min="5"
            :max="100"
            :step="5"
            show-value
            :format-value="(value: number) => `${value}%`"
            tooltip-trigger="always"
          />
        </label>

        <label class="release-policy-demo__field release-policy-demo__field--wide">
          <span>{{ labels.labels }}</span>
          <TxTagInput
            v-model="labelsInput"
            :placeholder="labels.tagsPlaceholder"
            :max="5"
            :separators="[',', '，']"
          />
        </label>
      </section>

      <aside class="release-policy-demo__panel release-policy-demo__panel--summary">
        <div>
          <p>{{ labels.preview }}</p>
          <h4>{{ labels.current }}</h4>
        </div>

        <div class="release-policy-demo__chips">
          <TxTag :label="labels.selectedScope" icon="i-carbon-branch" />
          <TxTag :label="formatText" icon="i-carbon-package" />
          <TxTag :label="rolloutText" icon="i-carbon-deployment-pattern" />
        </div>

        <div class="release-policy-demo__metric">
          <span>{{ labels.traffic }}</span>
          <strong>{{ trafficText }}</strong>
          <TxProgressBar :percentage="traffic" height="8px" status="success" flow-effect="shimmer" />
        </div>

        <div class="release-policy-demo__metric">
          <span>{{ labels.risk }}</span>
          <strong>{{ riskText }}</strong>
          <TxProgressBar :percentage="riskLevel * 25" height="8px" status="warning" mask-variant="dashed" />
        </div>

        <TxStatusBadge :text="labels.reviewed" status="success" size="sm" />
        <p class="release-policy-demo__note">
          {{ labels.summary }}
        </p>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.release-policy-demo {
  display: grid;
  gap: 16px;
  width: min(100%, 980px);
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--tx-color-primary) 16%, var(--tx-border-color-lighter));
  border-radius: 24px;
  background:
    radial-gradient(circle at 10% 0%, color-mix(in srgb, var(--tx-color-primary) 13%, transparent), transparent 34%),
    radial-gradient(circle at 88% 8%, color-mix(in srgb, var(--tx-color-warning) 12%, transparent), transparent 32%),
    var(--tx-bg-color);
  box-shadow: 0 18px 48px rgb(15 23 42 / 0.08);
}

.release-policy-demo__header,
.release-policy-demo__grid,
.release-policy-demo__split,
.release-policy-demo__chips {
  display: flex;
  gap: 12px;
}

.release-policy-demo__header {
  align-items: flex-start;
  justify-content: space-between;
}

.release-policy-demo__eyebrow {
  margin: 0 0 4px;
  color: var(--tx-color-primary);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.release-policy-demo h3,
.release-policy-demo h4,
.release-policy-demo p {
  margin: 0;
}

.release-policy-demo h3 {
  color: var(--tx-text-color-primary);
  font-size: 22px;
}

.release-policy-demo__header span,
.release-policy-demo__field > span,
.release-policy-demo__metric span,
.release-policy-demo__note,
.release-policy-demo__panel--summary > div:first-child p {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.release-policy-demo__grid {
  align-items: stretch;
}

.release-policy-demo__panel {
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 20px;
  background: color-mix(in srgb, var(--tx-bg-color) 86%, transparent);
}

.release-policy-demo__panel--main {
  display: grid;
  flex: 1;
  gap: 14px;
  padding: 16px;
}

.release-policy-demo__panel--summary {
  display: flex;
  width: 300px;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.release-policy-demo__field {
  display: grid;
  flex: 1;
  gap: 8px;
  min-width: 0;
}

.release-policy-demo__field--wide {
  width: 100%;
}

.release-policy-demo__field > span,
.release-policy-demo__metric span {
  font-weight: 700;
}

.release-policy-demo__chips {
  flex-wrap: wrap;
}

.release-policy-demo__metric {
  display: grid;
  gap: 8px;
}

.release-policy-demo__metric strong {
  color: var(--tx-text-color-primary);
  font-size: 18px;
}

.release-policy-demo__note {
  line-height: 1.6;
}

@media (max-width: 860px) {
  .release-policy-demo__header,
  .release-policy-demo__grid,
  .release-policy-demo__split {
    flex-direction: column;
  }

  .release-policy-demo__panel--summary {
    width: auto;
  }
}
</style>
