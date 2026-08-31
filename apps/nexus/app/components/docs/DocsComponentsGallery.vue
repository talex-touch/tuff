<script setup lang="ts">
import { computed, ref } from 'vue'
import tuffexPkg from '../../../../../packages/tuffex/package.json'

// Optional suite filter: suite overview pages embed only their own band and
// hide the cross-band jump tabs; without it the full hub grid renders.
const props = defineProps<{ suite?: 'base' | 'pro' | 'ai' | 'data' }>()

const { locale } = useI18n()

function bandVisible(key: 'base' | 'pro' | 'ai' | 'data') {
  return !props.suite || props.suite === key
}

const localeKey = computed(() => (locale.value === 'zh' ? 'zh' : 'en'))

function docPath(slug: string) {
  return `/docs/dev/components/${slug}.${localeKey.value}`
}

function cellLabel(en: string, zh: string) {
  return localeKey.value === 'zh' ? `${en} ${zh}` : en
}

const copy = computed(() => (localeKey.value === 'zh'
  ? {
      suiteBase: '基础',
      suitePro: '进阶',
      suiteAi: 'AI',
      suiteData: '数据',
      createPlugin: '新建插件',
      typeSomething: '输入点什么…',
      searchPlugins: '搜索插件…',
      password: '输入密码',
      selectChannel: '选择发布通道',
      channels: [
        { value: 'stable', label: '稳定版' },
        { value: 'beta', label: '测试版' },
        { value: 'snapshot', label: '快照版' },
      ],
      autoSync: '自动同步',
      partial: '部分选中',
      add: '添加',
      translate: '翻译',
      newPlugin: '新建插件',
      importWorkflow: '导入工作流',
      delete: '删除',
      dialogTitle: '删除插件？',
      dialogMessage: '该操作无法撤销。',
      confirm: '确认',
      online: '在线',
      reviewing: '审阅中',
      failed: '失败',
      aboutTitle: 'Tuffex 是什么？',
      aboutBody: '一套服务 Talex Touch 生态的 Vue 组件库。',
      installTitle: '如何安装？',
      installBody: 'pnpm add @talex-touch/tuffex',
      periods: [
        { value: 'day', label: '日' },
        { value: 'week', label: '周' },
        { value: 'month', label: '月' },
      ],
      tags: [
        { label: '稳定版', color: 'var(--tx-color-success)' },
        { label: '测试版', color: 'var(--tx-color-warning)' },
      ],
      closableTag: '可关闭',
      steps: ['下载', '安装', '完成'],
      allocation: [
        { key: 'stable', label: '稳定版', percent: 56 },
        { key: 'beta', label: '测试版', percent: 30 },
        { key: 'snapshot', label: '快照版', percent: 14 },
      ],
      confidence: [
        { value: 1, label: '低', tone: 'var(--tx-color-danger)' },
        { value: 2, label: '中', tone: 'var(--tx-color-warning)' },
        { value: 3, label: '高', tone: 'var(--tx-color-success)' },
      ],
      working: '处理中',
      searching: '检索中',
      typing: '正在输入…',
      suggestions: [
        { id: 's1', text: '如何发布插件？' },
        { id: 's2', text: '怎样声明权限？' },
        { id: 's3', text: '支持哪些平台？' },
      ],
      toolRows: [
        { id: 'read', icon: 'read', label: '读取清单', chip: 'manifest.json', mono: true },
        { id: 'run', icon: 'run', label: '执行构建', chip: 'pnpm build', mono: true },
      ],
      toolSummary: '2 次工具调用',
    }
  : {
      suiteBase: 'Basics',
      suitePro: 'Pro',
      suiteAi: 'AI',
      suiteData: 'Data',
      createPlugin: 'Create Plugin',
      typeSomething: 'Type something...',
      searchPlugins: 'Search plugins...',
      password: 'Password',
      selectChannel: 'Select channel',
      channels: [
        { value: 'stable', label: 'Stable' },
        { value: 'beta', label: 'Beta' },
        { value: 'snapshot', label: 'Snapshot' },
      ],
      autoSync: 'Auto sync',
      partial: 'Partial',
      add: 'Add',
      translate: 'Translate',
      newPlugin: 'New plugin',
      importWorkflow: 'Import workflow',
      delete: 'Delete',
      dialogTitle: 'Delete plugin?',
      dialogMessage: 'This action cannot be undone.',
      confirm: 'Confirm',
      online: 'Online',
      reviewing: 'Reviewing',
      failed: 'Failed',
      aboutTitle: 'What is Tuffex?',
      aboutBody: 'A Vue component family powering the Talex Touch ecosystem.',
      installTitle: 'How to install?',
      installBody: 'pnpm add @talex-touch/tuffex',
      periods: [
        { value: 'day', label: 'Day' },
        { value: 'week', label: 'Week' },
        { value: 'month', label: 'Month' },
      ],
      tags: [
        { label: 'Stable', color: 'var(--tx-color-success)' },
        { label: 'Beta', color: 'var(--tx-color-warning)' },
      ],
      closableTag: 'Closable',
      steps: ['Download', 'Install', 'Done'],
      allocation: [
        { key: 'stable', label: 'Stable', percent: 56 },
        { key: 'beta', label: 'Beta', percent: 30 },
        { key: 'snapshot', label: 'Snapshot', percent: 14 },
      ],
      confidence: [
        { value: 1, label: 'Low', tone: 'var(--tx-color-danger)' },
        { value: 2, label: 'Mid', tone: 'var(--tx-color-warning)' },
        { value: 3, label: 'High', tone: 'var(--tx-color-success)' },
      ],
      working: 'Working',
      searching: 'Searching',
      typing: 'Typing…',
      suggestions: [
        { id: 's1', text: 'How do I publish a plugin?' },
        { id: 's2', text: 'How to declare permissions?' },
        { id: 's3', text: 'Which platforms are supported?' },
      ],
      toolRows: [
        { id: 'read', icon: 'read', label: 'Read manifest', chip: 'manifest.json', mono: true },
        { id: 'run', icon: 'run', label: 'Run build', chip: 'pnpm build', mono: true },
      ],
      toolSummary: '2 tool calls',
    }))

const inputValue = ref('')
const searchValue = ref('tuffex')
const passwordValue = ref('talex-touch')
const channel = ref('')
const multiChannel = ref<string[]>(['stable', 'beta'])
const switchOn = ref(true)
const switchOff = ref(false)
const syncChecked = ref(true)
const sliderValue = ref(62)
const deleteOpen = ref(false)
const aboutOpen = ref<string[]>([])
const period = ref('week')
const periodStd = ref('day')
const rating = ref(4)
const page = ref(2)
const avatarNames = ['Talex', 'Kiri', 'Ame', 'Louis']

const sparkSeries = [{
  id: 'adoption',
  data: [4, 6, 5, 8, 7, 10, 9, 12, 11].map((value, time) => ({ time, value })),
}]

const orbStates = ['working', 'searching', 'solving']

const citeSources = [
  { id: 'repo', url: 'https://github.com/talex-touch/talex-touch' },
  { id: 'npm', url: 'https://www.npmjs.com/package/@talex-touch/tuffex' },
]

const INSTALL_CMD = 'pnpm add @talex-touch/tuffex'
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

async function copyInstall() {
  try {
    await navigator.clipboard.writeText(INSTALL_CMD)
  }
  catch {
    return
  }
  copied.value = true
  if (copyTimer)
    clearTimeout(copyTimer)
  copyTimer = setTimeout(() => (copied.value = false), 1600)
}

const suites = computed(() => [
  { key: 'base', label: copy.value.suiteBase },
  { key: 'pro', label: copy.value.suitePro },
  { key: 'ai', label: copy.value.suiteAi },
  { key: 'data', label: copy.value.suiteData },
])

function scrollToSuite(key: string) {
  document.getElementById(`docs-gallery-suite-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="docs-gallery">
    <div class="docs-gallery__bar">
      <button
        type="button"
        class="docs-gallery__install"
        :aria-label="`Copy: ${INSTALL_CMD}`"
        @click="copyInstall"
      >
        <span class="docs-gallery__install-prompt" aria-hidden="true">$</span>
        <span>{{ INSTALL_CMD }}</span>
        <span class="docs-gallery__install-icon" :class="copied ? 'i-carbon-checkmark' : 'i-carbon-copy'" aria-hidden="true" />
      </button>
      <span class="docs-gallery__version">v{{ tuffexPkg.version }}</span>
    </div>

    <nav v-if="!props.suite" id="docs-gallery-suite-base" class="docs-gallery__suite" :aria-label="copy.suiteBase">
      <button
        v-for="suiteTab in suites"
        :key="suiteTab.key"
        type="button"
        class="docs-gallery__suite-tab"
        :class="{ 'is-active': suiteTab.key === 'base' }"
        @click="scrollToSuite(suiteTab.key)"
      >
        {{ suiteTab.label }}
      </button>
    </nav>

    <div v-if="bandVisible('base')" class="docs-gallery__grid">
      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('button')">
          {{ cellLabel('Button', '按钮') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__stack">
              <TxButton icon="i-carbon-add">
                {{ copy.createPlugin }}
              </TxButton>
              <TxButton variant="primary" icon="i-carbon-add">
                {{ copy.createPlugin }}
              </TxButton>
              <TxButton loading>
                {{ copy.createPlugin }}
              </TxButton>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('input')">
          {{ cellLabel('Input', '输入') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__stack">
              <TuffInput v-model="inputValue" :placeholder="copy.typeSomething" />
              <TuffInput v-model="searchValue" prefix-icon="i-carbon-search" :placeholder="copy.searchPlugins" clearable />
              <TuffInput v-model="passwordValue" type="password" prefix-icon="i-carbon-locked" :placeholder="copy.password" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('select')">
          {{ cellLabel('Select', '选择器') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__stack">
              <TuffSelect v-model="channel" :placeholder="copy.selectChannel">
                <TuffSelectItem
                  v-for="option in copy.channels"
                  :key="option.value"
                  :value="option.value"
                  :label="option.label"
                />
              </TuffSelect>
              <TuffSelect v-model="multiChannel" multiple :placeholder="copy.selectChannel">
                <TuffSelectItem
                  v-for="option in copy.channels"
                  :key="option.value"
                  :value="option.value"
                  :label="option.label"
                />
              </TuffSelect>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('switch')">
          {{ cellLabel('Switch', '开关') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row">
              <TuffSwitch v-model="switchOn" />
              <TuffSwitch v-model="switchOff" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('checkbox')">
          {{ cellLabel('Checkbox', '复选框') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row">
              <TxCheckbox v-model="syncChecked" :label="copy.autoSync" />
              <TxCheckbox :model-value="false" indeterminate :label="copy.partial" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('slider')">
          {{ cellLabel('Slider', '滑块') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxSlider v-model="sliderValue" :min="0" :max="100" :step="1" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('tooltip')">
          {{ cellLabel('Tooltip', '提示') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row">
              <TxTooltip :content="copy.add" :model-value="true">
                <TxButton circle icon="i-carbon-add" />
              </TxTooltip>
              <TxTooltip :content="copy.translate">
                <TxButton circle icon="i-carbon-translate" />
              </TxTooltip>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('dropdown-menu')">
          {{ cellLabel('DropdownMenu', '下拉菜单') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxDropdownMenu>
              <template #trigger>
                <TxButton icon="i-carbon-add">
                  {{ copy.add }}
                </TxButton>
              </template>
              <TxDropdownItem>{{ copy.newPlugin }}</TxDropdownItem>
              <TxDropdownItem>{{ copy.importWorkflow }}</TxDropdownItem>
              <TxDropdownItem danger>
                {{ copy.delete }}
              </TxDropdownItem>
            </TxDropdownMenu>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('dialog')">
          {{ cellLabel('Dialog', '弹窗') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxButton @click="deleteOpen = true">
              {{ copy.delete }}
            </TxButton>
            <TxBlowDialog
              v-if="deleteOpen"
              :title="copy.dialogTitle"
              :message="copy.dialogMessage"
              :confirm-text="copy.confirm"
              :close="() => (deleteOpen = false)"
            />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('status-badge')">
          {{ cellLabel('StatusBadge', '状态徽标') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row">
              <TxStatusBadge :text="copy.online" status="success" />
              <TxStatusBadge :text="copy.reviewing" status="warning" />
              <TxStatusBadge :text="copy.failed" status="danger" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('progress-bar')">
          {{ cellLabel('ProgressBar', '进度条') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__stack">
              <TxProgressBar :percentage="62" />
              <TxProgressBar indeterminate />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('collapse')">
          {{ cellLabel('Collapse', '折叠') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxCollapse v-model="aboutOpen">
                <TxCollapseItem :title="copy.aboutTitle" name="about">
                  {{ copy.aboutBody }}
                </TxCollapseItem>
                <TxCollapseItem :title="copy.installTitle" name="install">
                  {{ copy.installBody }}
                </TxCollapseItem>
              </TxCollapse>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('radio')">
          {{ cellLabel('Radio', '单选') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__stack docs-gallery__stack--center">
              <TxRadioGroup v-model="period" type="button">
                <TxRadio
                  v-for="option in copy.periods"
                  :key="option.value"
                  :value="option.value"
                  :label="option.label"
                />
              </TxRadioGroup>
              <TxRadioGroup v-model="periodStd" type="standard" direction="row">
                <TxRadio
                  v-for="option in copy.periods.slice(0, 2)"
                  :key="option.value"
                  :value="option.value"
                  :label="option.label"
                  type="standard"
                />
              </TxRadioGroup>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('rating')">
          {{ cellLabel('Rating', '评分') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__stack docs-gallery__stack--center">
              <TxRating v-model="rating" />
              <TxRating :model-value="3.5" :precision="0.5" readonly />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('tag')">
          {{ cellLabel('Tag', '标签') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row">
              <TxTag
                v-for="tag in copy.tags"
                :key="tag.label"
                :label="tag.label"
                :color="tag.color"
              />
              <TxTag :label="copy.closableTag" closable />
              <TxTag label="+3" variant="plain" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('badge')">
          {{ cellLabel('Badge', '徽标') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row">
              <TxBadge variant="error" :value="3" />
              <TxBadge variant="primary" value="PRO" />
              <TxBadge variant="success" dot />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('avatar')">
          {{ cellLabel('Avatar', '头像') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__stack docs-gallery__stack--center">
              <TxAvatarGroup :max="3">
                <TxAvatar v-for="name in avatarNames" :key="name" :name="name" />
              </TxAvatarGroup>
              <div class="docs-gallery__row">
                <TxAvatar name="Talex" status="online" />
                <TxAvatar name="Kiri" shape="rounded" />
                <TxAvatar icon="user" shape="square" />
              </div>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('steps')">
          {{ cellLabel('Steps', '步骤条') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxSteps :active="1" size="small">
              <TxStep
                v-for="(title, index) in copy.steps"
                :key="title"
                :step="index"
                :title="title"
              />
            </TxSteps>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('pagination')">
          {{ cellLabel('Pagination', '分页') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxPagination v-model:current-page="page" :total-pages="5" />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('skeleton')">
          {{ cellLabel('Skeleton', '骨架屏') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__stack">
              <div class="docs-gallery__row">
                <TxSkeleton loading variant="circle" :width="32" :height="32" />
                <div class="docs-gallery__grow">
                  <TxSkeleton loading :lines="2" width="100%" />
                </div>
              </div>
              <TxSkeleton loading :lines="2" width="100%" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>
    </div>

    <nav v-if="!props.suite" id="docs-gallery-suite-pro" class="docs-gallery__suite" :aria-label="copy.suitePro">
      <button
        v-for="suiteTab in suites"
        :key="suiteTab.key"
        type="button"
        class="docs-gallery__suite-tab"
        :class="{ 'is-active': suiteTab.key === 'pro' }"
        @click="scrollToSuite(suiteTab.key)"
      >
        {{ suiteTab.label }}
      </button>
    </nav>

    <div v-if="bandVisible('pro')" class="docs-gallery__grid">
      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('version-capsule')">
          {{ cellLabel('VersionCapsule', '版本胶囊') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxVersionCapsule :version="`v${tuffexPkg.version}`" channel="BETA" tone="preview" />
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('glow-text')">
          {{ cellLabel('GlowText', '扫光') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxGlowText class="docs-gallery__glow" tag="span">
              Tuffex
            </TxGlowText>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('border-beam')">
          {{ cellLabel('BorderBeam', '流光边框') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <TxBorderBeam size="md" color-variant="ocean" theme="auto">
              <div class="docs-gallery__beam-card">
                @talex-touch/tuffex
              </div>
            </TxBorderBeam>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>
    </div>

    <nav v-if="!props.suite" id="docs-gallery-suite-ai" class="docs-gallery__suite" :aria-label="copy.suiteAi">
      <button
        v-for="suiteTab in suites"
        :key="suiteTab.key"
        type="button"
        class="docs-gallery__suite-tab"
        :class="{ 'is-active': suiteTab.key === 'ai' }"
        @click="scrollToSuite(suiteTab.key)"
      >
        {{ suiteTab.label }}
      </button>
    </nav>

    <div v-if="bandVisible('ai')" class="docs-gallery__grid">
      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('thinking-orb')">
          {{ cellLabel('ThinkingOrb', '思考指示球') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row docs-gallery__row--loose">
              <TxThinkingOrb
                v-for="state in orbStates"
                :key="state"
                :state="state"
                :size="20"
                :display-size="36"
              />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('working-indicator')">
          {{ cellLabel('WorkingIndicator', '工作指示器') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__stack docs-gallery__stack--center">
              <TxWorkingIndicator :label="copy.working" variant="drive" />
              <TxWorkingIndicator :label="copy.searching" variant="orbit" :show-elapsed="false" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('typing-indicator')">
          {{ cellLabel('TypingIndicator', '打字中') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row docs-gallery__row--loose">
              <TxTypingIndicator variant="dots" :text="copy.typing" />
              <TxTypingIndicator variant="ring" :show-text="false" :aria-label="copy.typing" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('suggestion-chips')">
          {{ cellLabel('SuggestionChips', '建议胶囊') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxSuggestionChips :suggestions="copy.suggestions" layout="list" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('tool-chips')">
          {{ cellLabel('ToolChips', '工具调用流') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__block--wide">
              <TxToolChips
                :rows="copy.toolRows"
                :diffs="[{ file: 'index.ts', add: 12, del: 3 }]"
                :summary="copy.toolSummary"
              />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('inline-citation')">
          {{ cellLabel('InlineCitation', '行内引用') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row">
              <TxInlineCitation
                v-for="source in citeSources"
                :key="source.id"
                :source="source"
                :appear="false"
              />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>
    </div>

    <nav v-if="!props.suite" id="docs-gallery-suite-data" class="docs-gallery__suite" :aria-label="copy.suiteData">
      <button
        v-for="suiteTab in suites"
        :key="suiteTab.key"
        type="button"
        class="docs-gallery__suite-tab"
        :class="{ 'is-active': suiteTab.key === 'data' }"
        @click="scrollToSuite(suiteTab.key)"
      >
        {{ suiteTab.label }}
      </button>
    </nav>

    <div v-if="bandVisible('data')" class="docs-gallery__grid">
      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('spark-chart')">
          {{ cellLabel('SparkChart', '迷你折线图') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block docs-gallery__spark">
              <TxSparkChart :series="sparkSeries" grid />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('allocation-bar')">
          {{ cellLabel('AllocationBar', '占比条') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__block">
              <TxAllocationBar :segments="copy.allocation" />
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>

      <section class="docs-gallery__cell">
        <NuxtLink class="docs-gallery__label" :to="docPath('signal-meter')">
          {{ cellLabel('SignalMeter', '信号量表') }}
        </NuxtLink>
        <div class="docs-gallery__stage">
          <ClientOnly>
            <div class="docs-gallery__row docs-gallery__row--loose">
              <div v-for="level in copy.confidence" :key="level.value" class="docs-gallery__meter">
                <TxSignalMeter :value="level.value" :max="3" :tone="level.tone" :bar-height="16" :bar-width="5" :label="level.label" />
                <span class="docs-gallery__meter-text">{{ level.label }}</span>
              </div>
            </div>
            <template #fallback>
              <div class="docs-gallery__ph" />
            </template>
          </ClientOnly>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.docs-gallery {
  --docs-gallery-line: color-mix(in srgb, var(--docs-border) 72%, transparent);
  border: 1px solid var(--docs-gallery-line);
  border-radius: 14px;
  overflow: hidden;
}

.docs-gallery__bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 18px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--docs-muted);
}

.docs-gallery__version {
  padding: 2px 7px;
  border-radius: 6px;
  border: 1px solid var(--docs-inline-code-border);
  background: var(--docs-inline-code-bg);
  line-height: 1.4;
}

/* Echoes the sidebar's underlined suite tabs (Basics / Advanced / AI). */
.docs-gallery__suite {
  display: flex;
  align-items: baseline;
  gap: 18px;
  padding: 18px 20px 14px;
  border-top: 1px solid var(--docs-gallery-line);
  /* Keeps the tab row visible below the fixed site header when a suite tab
     scrolls its section into view. */
  scroll-margin-top: 90px;
}

.docs-gallery__suite-tab {
  padding: 0 0 6px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  color: var(--docs-muted);
  cursor: pointer;
  transition: color 0.18s ease;
}

.docs-gallery__suite-tab.is-active {
  color: inherit;
  border-bottom-color: currentColor;
}

.docs-gallery__suite-tab:not(.is-active):hover {
  color: var(--docs-accent);
}

.docs-gallery__install {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border: 1px solid var(--docs-inline-code-border);
  border-radius: 8px;
  background: var(--docs-inline-code-bg);
  font: inherit;
  color: inherit;
  cursor: pointer;
  transition: color 0.18s ease, border-color 0.18s ease;
}

.docs-gallery__install:hover {
  color: var(--docs-accent);
}

.docs-gallery__install-prompt {
  opacity: 0.55;
}

.docs-gallery__install-icon {
  width: 13px;
  height: 13px;
}

.docs-gallery__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.docs-gallery__cell {
  position: relative;
  border-top: 1px solid var(--docs-gallery-line);
}

.docs-gallery__cell:nth-child(2n) {
  border-left: 1px solid var(--docs-gallery-line);
}

/* Beats the docs prose link styling (accent color + underline) that would
   otherwise restyle these anchors. */
.docs-gallery .docs-gallery__cell a.docs-gallery__label {
  position: absolute;
  top: 16px;
  left: 20px;
  z-index: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--docs-muted);
  text-decoration: none;
  border-bottom: none;
  transition: color 0.18s ease;
}

.docs-gallery .docs-gallery__cell a.docs-gallery__label:hover {
  color: var(--docs-accent);
  text-decoration: none;
  border-bottom: none;
}

.docs-gallery__stage {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 236px;
  padding: 56px 28px 40px;
}

.docs-gallery__stack {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}

.docs-gallery__stack--center {
  align-items: center;
  gap: 14px;
}

.docs-gallery__row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.docs-gallery__row--loose {
  gap: 22px;
}

.docs-gallery__grow {
  flex: 1;
  min-width: 0;
}

.docs-gallery__block {
  width: min(240px, 100%);
}

.docs-gallery__block--wide {
  width: min(300px, 100%);
}

.docs-gallery__spark {
  height: 76px;
}

.docs-gallery__glow {
  font-size: 24px;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.docs-gallery__beam-card {
  padding: 14px 22px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  color: var(--docs-muted);
}

.docs-gallery__meter {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.docs-gallery__meter-text {
  font-size: 12px;
  color: var(--docs-muted);
}

.docs-gallery__ph {
  width: 140px;
  height: 34px;
  border-radius: 8px;
  background: linear-gradient(
    100deg,
    color-mix(in srgb, var(--docs-muted) 8%, transparent),
    color-mix(in srgb, var(--docs-muted) 15%, transparent),
    color-mix(in srgb, var(--docs-muted) 8%, transparent)
  );
  background-size: 200% 100%;
  animation: docs-gallery-shimmer 1.4s ease-in-out infinite;
}

@keyframes docs-gallery-shimmer {
  from {
    background-position: 120% 0;
  }

  to {
    background-position: -80% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .docs-gallery__ph {
    animation: none;
  }
}

@media (max-width: 640px) {
  .docs-gallery__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .docs-gallery__cell:nth-child(2n) {
    border-left: none;
  }

  .docs-gallery__stage {
    min-height: 196px;
    padding: 52px 20px 32px;
  }
}
</style>
