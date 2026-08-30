<script setup lang="ts">
import { computed, ref } from 'vue'
import tuffexPkg from '../../../../../packages/tuffex/package.json'

const { locale } = useI18n()

const localeKey = computed(() => (locale.value === 'zh' ? 'zh' : 'en'))

function docPath(slug: string) {
  return `/docs/dev/components/${slug}.${localeKey.value}`
}

function cellLabel(en: string, zh: string) {
  return localeKey.value === 'zh' ? `${en} ${zh}` : en
}

const copy = computed(() => (localeKey.value === 'zh'
  ? {
      createPlugin: '新建插件',
      typeSomething: '输入点什么…',
      selectChannel: '选择发布通道',
      channels: [
        { value: 'stable', label: '稳定版' },
        { value: 'beta', label: '测试版' },
        { value: 'snapshot', label: '快照版' },
      ],
      autoSync: '自动同步',
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
      aboutTitle: 'Tuffex 是什么？',
      aboutBody: '一套服务 Talex Touch 生态的 Vue 组件库。',
    }
  : {
      createPlugin: 'Create Plugin',
      typeSomething: 'Type something...',
      selectChannel: 'Select channel',
      channels: [
        { value: 'stable', label: 'Stable' },
        { value: 'beta', label: 'Beta' },
        { value: 'snapshot', label: 'Snapshot' },
      ],
      autoSync: 'Auto sync',
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
      aboutTitle: 'What is Tuffex?',
      aboutBody: 'A Vue component family powering the Talex Touch ecosystem.',
    }))

const inputValue = ref('')
const channel = ref('')
const switchOn = ref(true)
const syncChecked = ref(true)
const sliderValue = ref(62)
const deleteOpen = ref(false)
const aboutOpen = ref<string[]>([])
</script>

<template>
  <div class="docs-gallery">
    <div class="docs-gallery__bar">
      <span class="docs-gallery__pkg">@talex-touch/tuffex</span>
      <span class="docs-gallery__version">v{{ tuffexPkg.version }}</span>
    </div>

    <div class="docs-gallery__grid">
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
            <div class="docs-gallery__block">
              <TuffInput v-model="inputValue" :placeholder="copy.typeSomething" clearable />
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
            <div class="docs-gallery__block">
              <TuffSelect v-model="channel" :placeholder="copy.selectChannel">
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
            <TuffSwitch v-model="switchOn" />
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
            <TxCheckbox v-model="syncChecked" :label="copy.autoSync" />
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
              <TxTooltip :content="copy.add">
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
            <div class="docs-gallery__block">
              <TxProgressBar :percentage="62" />
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
              </TxCollapse>
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

.docs-gallery__row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.docs-gallery__block {
  width: min(240px, 100%);
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
